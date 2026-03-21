/**
 * LYWSD03MMC pvvx Custom Firmware BLE Scanner
 *
 * Hardware : ESP32 DevKitC V (38-pin)
 * Library  : NimBLE-Arduino, ArduinoJson
 *
 * BLE advertisement format (pvvx custom, Service UUID 0x181A):
 *   Bytes  0-5  : MAC address (reversed, i.e. byte[0] = MAC[5])
 *   Bytes  6-7  : Temperature  int16 LE / 100  → °C
 *   Bytes  8-9  : Humidity    uint16 LE / 100  → %RH
 *   Bytes 10-11 : Battery mV  uint16 LE
 *   Byte  12    : Battery %   uint8
 *   Byte  13    : Packet counter
 *   Byte  14    : Flags
 *
 * Every 60 seconds the sketch posts all cached readings to the IoT backend.
 * The server only stores readings for registered devices (by MAC).
 */

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <map>
#include <string>

// ─── User configuration ───────────────────────────────────────────────────────
static const char* WIFI_SSID   = "Steins;Gate";    // ← 여기에 실제 WiFi 이름
static const char* WIFI_PASS   = "121621786aa!!"; // ← 여기에 실제 WiFi 비밀번호
static const char* SERVER_URL  = "http://192.168.1.8:8093/readings/batch";
static const unsigned long POST_INTERVAL_MS = 60000UL;   // 60 s
static const unsigned long STALE_MS         = 120000UL;  // discard readings older than 2 min
static const int MAX_SENSORS = 16;
// ─────────────────────────────────────────────────────────────────────────────

struct SensorData {
    char     mac[18];        // "aa:bb:cc:dd:ee:ff\0"
    float    temperature;
    float    humidity;
    uint16_t battery_mv;
    uint8_t  battery_pct;
    int8_t   rssi;
    unsigned long updated_ms;
    bool valid;
};

static SensorData g_sensors[MAX_SENSORS];
static int g_count = 0;
static unsigned long g_last_post_ms = 0;

static const unsigned long SCAN_LOG_THROTTLE_MS = 10000UL;  // 10 s
static std::map<std::string, unsigned long> g_scan_log_ts;

// ─── BLE callback ─────────────────────────────────────────────────────────────
class ScanCallbacks : public NimBLEScanCallbacks {
    void onResult(const NimBLEAdvertisedDevice* dev) override {
        // DEBUG: MAC당 10초에 1번만 출력
        std::string addr = dev->getAddress().toString();
        unsigned long now = millis();
        auto it = g_scan_log_ts.find(addr);
        if (it == g_scan_log_ts.end() || now - it->second >= SCAN_LOG_THROTTLE_MS) {
            g_scan_log_ts[addr] = now;
            Serial.printf("[SCAN] %s  RSSI:%d  name:%s  svcData:%d  svcUUID:%d\n",
                addr.c_str(),
                dev->getRSSI(),
                dev->haveName() ? dev->getName().c_str() : "-",
                dev->haveServiceData() ? 1 : 0,
                dev->haveServiceUUID() ? 1 : 0);
            if (dev->haveServiceUUID()) {
                for (int i = 0; i < (int)dev->getServiceUUIDCount(); i++) {
                    Serial.printf("  UUID[%d]: %s\n", i, dev->getServiceUUID(i).toString().c_str());
                }
            }
        }

        if (!dev->haveServiceData()) return;

        std::string raw = dev->getServiceData(NimBLEUUID((uint16_t)0x181A));
        if (raw.size() < 13) return;

        const uint8_t* d = reinterpret_cast<const uint8_t*>(raw.data());

        char mac[18];
        snprintf(mac, sizeof(mac), "%02x:%02x:%02x:%02x:%02x:%02x",
                 d[5], d[4], d[3], d[2], d[1], d[0]);

        int16_t  temp_raw = static_cast<int16_t>(d[6] | (d[7] << 8));
        uint16_t hum_raw  = static_cast<uint16_t>(d[8] | (d[9] << 8));
        uint16_t batt_mv  = static_cast<uint16_t>(d[10] | (d[11] << 8));
        uint8_t  batt_pct = d[12];

        // find existing slot or allocate new
        int idx = -1;
        for (int i = 0; i < g_count; i++) {
            if (strcmp(g_sensors[i].mac, mac) == 0) { idx = i; break; }
        }
        if (idx == -1) {
            if (g_count >= MAX_SENSORS) return;
            idx = g_count++;
            strncpy(g_sensors[idx].mac, mac, sizeof(g_sensors[idx].mac));
        }

        g_sensors[idx].temperature = temp_raw / 100.0f;
        g_sensors[idx].humidity    = hum_raw  / 100.0f;
        g_sensors[idx].rssi        = dev->getRSSI();
        Serial.printf("[IOT] %s  %.1f°C  %.1f%%  %dmV  %d%%  RSSI:%d\n",
            mac, g_sensors[idx].temperature, g_sensors[idx].humidity, batt_mv, batt_pct, g_sensors[idx].rssi);
        g_sensors[idx].battery_mv  = batt_mv;
        g_sensors[idx].battery_pct = batt_pct;
        g_sensors[idx].updated_ms  = millis();
        g_sensors[idx].valid       = true;
    }
};

// ─── WiFi helper ─────────────────────────────────────────────────────────────
static void ensure_wifi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.print("[WiFi] reconnecting");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print('.');
    }
    Serial.println(WiFi.status() == WL_CONNECTED
                   ? " OK: " + WiFi.localIP().toString()
                   : " FAILED");
}

// ─── HTTP POST ────────────────────────────────────────────────────────────────
static void post_readings() {
    ensure_wifi();
    if (WiFi.status() != WL_CONNECTED) return;

    JsonDocument doc;
    JsonArray arr = doc["readings"].to<JsonArray>();

    unsigned long now = millis();
    for (int i = 0; i < g_count; i++) {
        if (!g_sensors[i].valid) continue;
        if (now - g_sensors[i].updated_ms > STALE_MS) continue;

        JsonObject r = arr.add<JsonObject>();
        r["mac_address"]  = g_sensors[i].mac;
        r["temperature"]  = g_sensors[i].temperature;
        r["humidity"]     = g_sensors[i].humidity;
        r["battery_mv"]   = g_sensors[i].battery_mv;
        r["battery_pct"]  = g_sensors[i].battery_pct;
        r["rssi"]         = g_sensors[i].rssi;
    }

    if (arr.size() == 0) {
        Serial.println("[POST] no fresh readings, skip");
        return;
    }

    String body;
    serializeJson(doc, body);

    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(body);
    http.end();

    Serial.printf("[POST] %d sensor(s) → HTTP %d\n", (int)arr.size(), code);
}

// ─── setup / loop ────────────────────────────────────────────────────────────
static NimBLEScan* g_scan = nullptr;

void setup() {
    Serial.begin(115200);
    delay(500);

    // WiFi
    WiFi.mode(WIFI_STA);
    ensure_wifi();

    // BLE passive scan
    NimBLEDevice::init("");
    g_scan = NimBLEDevice::getScan();
    g_scan->setScanCallbacks(new ScanCallbacks(), /*wantDuplicates=*/true);
    g_scan->setActiveScan(false);
    g_scan->setInterval(160);
    g_scan->setWindow(144);

    // duration=0 → continuous scan (never stops)
    g_scan->start(0);
    Serial.println("[BLE] continuous scan started");
}

void loop() {
    if (millis() - g_last_post_ms >= POST_INTERVAL_MS) {
        post_readings();
        g_last_post_ms = millis();
    }
    delay(100);
}
