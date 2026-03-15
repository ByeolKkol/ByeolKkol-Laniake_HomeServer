import asyncio
import json
import os
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://byeolkkol@localhost:5432/chzzk")

app = FastAPI(title="AI Discussion Chat Room")

# Debate state
DEBATE_ORDER = ["claude", "gemini", "codex"]
debate: dict = {"active": False, "max_turns": 0, "round": 0, "agrees": set()}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# name -> WebSocket
clients: dict[str, WebSocket] = {}
# name -> asyncio.Task
client_tasks: dict[str, asyncio.Task] = {}

pool: asyncpg.Pool = None  # type: ignore

PROMPT_KEYS = {"common", "claude", "gemini", "codex"}
AGENT_CONFIG_KEYS = {"user", "claude", "gemini", "codex"}
SETTINGS_KEYS = {"short_term_turns"}


@app.on_event("startup")
async def startup() -> None:
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL)
    await init_db()


@app.on_event("shutdown")
async def shutdown() -> None:
    await pool.close()


async def init_db() -> None:
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_messages (
                id SERIAL PRIMARY KEY,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_prompt_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_agent_config (
                key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL DEFAULT '',
                avatar_data TEXT NOT NULL DEFAULT ''
            )
        """)
        for key in PROMPT_KEYS:
            await conn.execute(
                "INSERT INTO ai_prompt_config (key, value) VALUES ($1, '') ON CONFLICT DO NOTHING",
                key,
            )
        for key in AGENT_CONFIG_KEYS:
            await conn.execute(
                "INSERT INTO ai_agent_config (key, display_name, avatar_data) VALUES ($1, '', '') ON CONFLICT DO NOTHING",
                key,
            )
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute(
            "INSERT INTO ai_settings (key, value) VALUES ('short_term_turns', '20') ON CONFLICT DO NOTHING"
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def save_message(sender: str, content: str, ts: str) -> None:
    ts_dt = datetime.fromisoformat(ts) if ts else datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO ai_messages (sender, content, ts) VALUES ($1, $2, $3)",
            sender, content, ts_dt,
        )


async def broadcast(data: dict, exclude: str | None = None) -> None:
    if data.get("type") == "message" and data.get("sender") and data.get("content") is not None:
        await save_message(data["sender"], data["content"], data.get("ts", now_iso()))

        sender = data["sender"]
        if debate["active"] and sender in DEBATE_ORDER:
            content: str = data["content"]
            if "[AGREE]" in content:
                debate["agrees"].add(sender)
            else:
                debate["agrees"].discard(sender)

            if sender == DEBATE_ORDER[-1]:
                debate["round"] += 1
                end_reason: str | None = None
                if debate["agrees"] == set(DEBATE_ORDER):
                    end_reason = "consensus"
                elif debate["round"] >= debate["max_turns"]:
                    end_reason = "max_turns"

                if end_reason:
                    debate["active"] = False
                    end_event = json.dumps(
                        {"type": "debate_end", "reason": end_reason, "round": debate["round"], "ts": now_iso()},
                        ensure_ascii=False,
                    )
                    for ws in list(clients.values()):
                        try:
                            await ws.send_text(end_event)
                        except Exception:
                            pass
                    return

    payload = json.dumps(data, ensure_ascii=False)
    for name, ws in list(clients.items()):
        if name == exclude:
            continue
        try:
            await ws.send_text(payload)
        except Exception:
            pass


@app.get("/history")
async def get_history() -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT sender, content, ts FROM ai_messages ORDER BY id DESC LIMIT 200"
        )
    messages = [{"sender": r["sender"], "content": r["content"], "ts": r["ts"].isoformat()} for r in reversed(rows)]
    return {"messages": messages}


@app.get("/participants")
def get_participants() -> dict:
    return {"list": list(clients.keys())}


class DebateStartRequest(BaseModel):
    max_turns: int = 10


@app.post("/debate/start")
async def debate_start(req: DebateStartRequest) -> dict:
    debate["active"] = True
    debate["max_turns"] = req.max_turns
    debate["round"] = 0
    debate["agrees"] = set()
    await broadcast({"type": "debate_start", "max_turns": req.max_turns, "ts": now_iso()})
    return {"status": "started", "max_turns": req.max_turns}


@app.post("/debate/stop")
async def debate_stop() -> dict:
    debate["active"] = False
    await broadcast({"type": "debate_end", "reason": "user_stopped", "round": debate["round"], "ts": now_iso()})
    return {"status": "stopped"}


@app.get("/debate/status")
def debate_status() -> dict:
    return {
        "active": debate["active"],
        "max_turns": debate["max_turns"],
        "round": debate["round"],
        "agrees": list(debate["agrees"]),
    }


@app.get("/prompts")
async def get_prompts() -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM ai_prompt_config")
    return {r["key"]: r["value"] for r in rows}


class PromptUpdateRequest(BaseModel):
    value: str


@app.put("/prompts/{key}")
async def update_prompt(key: str, req: PromptUpdateRequest) -> dict:
    if key not in PROMPT_KEYS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO ai_prompt_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            key, req.value,
        )
    return {"key": key, "value": req.value}


@app.get("/agent-config")
async def get_agent_config() -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, display_name, avatar_data FROM ai_agent_config")
    return {r["key"]: {"display_name": r["display_name"], "avatar_data": r["avatar_data"]} for r in rows}


class AgentConfigUpdateRequest(BaseModel):
    display_name: str = ""
    avatar_data: str = ""


@app.put("/agent-config/{key}")
async def update_agent_config(key: str, req: AgentConfigUpdateRequest) -> dict:
    if key not in AGENT_CONFIG_KEYS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown agent key: {key}")
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO ai_agent_config (key, display_name, avatar_data) VALUES ($1, $2, $3)
               ON CONFLICT (key) DO UPDATE SET display_name = $2, avatar_data = $3""",
            key, req.display_name, req.avatar_data,
        )
    return {"key": key, "display_name": req.display_name}


@app.get("/settings")
async def get_settings() -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM ai_settings")
    return {r["key"]: r["value"] for r in rows}


class SettingUpdateRequest(BaseModel):
    value: str


@app.put("/settings/{key}")
async def update_setting(key: str, req: SettingUpdateRequest) -> dict:
    if key not in SETTINGS_KEYS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO ai_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            key, req.value,
        )
    return {"key": key, "value": req.value}


@app.websocket("/ws/join/{name}")
async def join_room(websocket: WebSocket, name: str) -> None:
    await websocket.accept()

    if name in clients:
        # user는 재접속 허용 — 기존 WS를 닫고 clients/tasks에서 제거
        if name == "user":
            old_ws = clients.pop(name, None)
            client_tasks.pop(name, None)
            if old_ws:
                try:
                    await old_ws.close()
                except Exception:
                    pass
        else:
            await websocket.send_text(json.dumps({"type": "error", "message": f"'{name}' is already connected"}))
            await websocket.close()
            return

    clients[name] = websocket
    client_tasks[name] = asyncio.current_task()

    await broadcast({"type": "join", "name": name, "ts": now_iso()}, exclude=name)
    await websocket.send_text(json.dumps(
        {"type": "participants", "list": list(clients.keys())},
        ensure_ascii=False,
    ))

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            data["sender"] = name
            data["ts"] = now_iso()

            if data.get("type") == "kick":
                target = data.get("name", "")
                if target and target != name:
                    clients.pop(target, None)
                    task = client_tasks.pop(target, None)
                    if task:
                        task.cancel()
                    await broadcast({"type": "leave", "name": target, "ts": now_iso()})
                continue

            await broadcast(data)

    except WebSocketDisconnect:
        if clients.get(name) is websocket:
            clients.pop(name, None)
            client_tasks.pop(name, None)
            await broadcast({"type": "leave", "name": name, "ts": now_iso()})

    except asyncio.CancelledError:
        if clients.get(name) is websocket:
            clients.pop(name, None)
            client_tasks.pop(name, None)
        try:
            await websocket.close()
        except Exception:
            pass
        await broadcast({"type": "leave", "name": name, "ts": now_iso()})
        raise
