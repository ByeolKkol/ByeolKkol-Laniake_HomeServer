# Health Backend 구현 계획

## 목표
홈서버 대시보드에 헬스 섹션 추가:
- 샤오미 미지아 S800 체중계 → 체중, 체지방, 근육량 등 표시
- 갤럭시 워치 → 운동량, 심박수 표시

---

## 기기 정보

### 샤오미 미지아 체중계 S800
- **연동 앱**: Mi Home (미홈)
- **데이터 흐름**: S800 → (BT) → Mi Home 앱 → Xiaomi 클라우드 → 홈서버 polling
- **수집 방식**: Xiaomi 클라우드 API (서버 쪽 polling, 폰 별도 작업 없음)
- **예상 수집 데이터**: 체중, BMI, 체지방률, 근육량, 골량, 내장지방, 수분율, 기초대사량
- **상태**: 체중계 배송 중 (미도착)

### 갤럭시 워치 (Galaxy Fold 6 연동)
- **연동 앱**: 삼성헬스 → Health Connect
- **데이터 흐름**: Galaxy Watch → 삼성헬스 → Health Connect → 홈서버 push
- **수집 방식**: 폰 쪽 push 필요 (Health Auto Export 앱 또는 Tasker 웹훅)
- **예상 수집 데이터**: 운동 기록, 심박수, 걸음수
- **상태**: 미구현 (체중계 이후 작업 예정)

---

## 구현 계획

### 1. 백엔드 (`health-backend/`)
새 FastAPI 서비스 또는 기존 서비스에 `/health` 라우터 추가

#### DB 테이블
```sql
-- 체중 측정 기록
CREATE TABLE health_weight (
    id          SERIAL PRIMARY KEY,
    ts          DOUBLE PRECISION NOT NULL,  -- Unix timestamp
    weight_kg   REAL NOT NULL,
    bmi         REAL,
    body_fat_pct REAL,
    muscle_kg   REAL,
    bone_kg     REAL,
    visceral_fat INTEGER,
    water_pct   REAL,
    bmr_kcal    INTEGER,   -- 기초대사량
    source      TEXT DEFAULT 'xiaomi'
);

-- 심박수 기록
CREATE TABLE health_heartrate (
    id      SERIAL PRIMARY KEY,
    ts      DOUBLE PRECISION NOT NULL,
    bpm     INTEGER NOT NULL,
    source  TEXT DEFAULT 'galaxy_watch'
);

-- 운동 기록
CREATE TABLE health_exercise (
    id           SERIAL PRIMARY KEY,
    started_at   DOUBLE PRECISION NOT NULL,
    ended_at     DOUBLE PRECISION NOT NULL,
    type         TEXT,           -- 걷기, 달리기 등
    duration_min INTEGER,
    calories     INTEGER,
    distance_m   INTEGER,
    source       TEXT DEFAULT 'galaxy_watch'
);
```

#### API 엔드포인트
```
GET  /health/weight          최근 체중 기록 조회
GET  /health/weight/latest   최신 측정값 1건
POST /health/weight          체중 데이터 push (Galaxy Watch 연동 시)
GET  /health/heartrate       심박수 이력
POST /health/heartrate       심박수 push
GET  /health/exercise        운동 기록 조회
POST /health/exercise        운동 기록 push
```

#### Xiaomi 클라우드 폴러
```python
# xiaomi_poller.py
# python-miio 또는 micloud 라이브러리로 Xiaomi 계정 인증
# 주기적으로 S800 체중 데이터 poll → DB 저장
# 환경변수: XIAOMI_USERNAME, XIAOMI_PASSWORD, XIAOMI_REGION(cn/de/us/sg)
```

### 2. 프론트엔드
- `App.tsx`: IoT처럼 `Health` 메뉴 추가, 하위 탭 구성
  - `체중` 탭: 체중 추이 그래프, 최신 체성분 수치 카드
  - `활동` 탭: 심박수 그래프, 운동 기록 리스트

### 3. docker-compose
```yaml
health-backend:
  build:
    context: ./health-backend
    dockerfile: Dockerfile
  container_name: health-backend
  restart: unless-stopped
  environment:
    - DATABASE_URL=postgresql://byeolkkol@db:5432/chzzk
    - XIAOMI_USERNAME=${XIAOMI_USERNAME:-}
    - XIAOMI_PASSWORD=${XIAOMI_PASSWORD:-}
    - XIAOMI_REGION=${XIAOMI_REGION:-cn}
  ports:
    - "8095:8095"
  networks:
    - laniake_homeserver_default
```

---

## 작업 순서 (체중계 도착 후)

1. [ ] Xiaomi 클라우드 API 토큰 확인 (S800 device_id 조회)
2. [ ] `xiaomi_poller.py` 구현 및 테스트
3. [ ] DB 테이블 및 `/health/weight` 엔드포인트 구현
4. [ ] 프론트엔드 Health 섹션 (체중 그래프, 체성분 카드)
5. [ ] docker-compose에 health-backend 추가 및 배포
6. [ ] Galaxy Watch (Health Connect) 연동 — 별도 세션

---

## 참고

- Xiaomi 클라우드 인증: `python-miio` (`miiocli cloud` 명령으로 device 목록 및 토큰 확인)
- 관련 라이브러리: `python-miio`, `micloud`
- Mi Home 체중 데이터 API: 인증 후 `/v2/record/data/query` 류의 엔드포인트 (S800 도착 후 실제 확인 필요)
- 포트: `8095` (tapo-backend 8094 다음)
- 프론트 API base: `http://${serverIp}:8095`
