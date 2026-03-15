"""
각 AI 에이전트가 채팅방에 독립 참가하는 클라이언트.

사용법:
  python agent_client.py --name claude --server ws://192.168.1.89:8092
  python agent_client.py --name gemini
  python agent_client.py --name codex
"""
import asyncio
import argparse
import json
import urllib.request
import websockets
from websockets.exceptions import ConnectionClosed

from agents.claude_agent import stream_claude, extract_claude
from agents.gemini_agent import stream_gemini, extract_gemini
from agents.codex_agent import stream_codex, extract_codex
from agents.memory import MemoryManager

STREAM_FNS = {
    "claude": stream_claude,
    "gemini": stream_gemini,
    "codex": stream_codex,
}

EXTRACT_FNS = {
    "claude": extract_claude,
    "gemini": extract_gemini,
    "codex": extract_codex,
}

# 토론 순서: claude → gemini → codex → claude → ...
# predecessor[X] = X가 응답해야 하는 직전 발화자
DEBATE_PREDECESSOR = {
    "gemini": "claude",
    "codex": "gemini",
    "claude": "codex",
}

EXTRACT_PROMPT = """\
아래 대화에서 나중에 참고할 만한 중요한 사실만 추출해줘.
- 한 줄에 하나씩
- 설명 없이 사실만 (예: "사용자는 소설 읽기를 좋아함")
- 없으면 빈 응답
- 최대 5줄

{conversation}

기억:"""


def _fetch_history(http_base: str, name: str) -> list[dict]:
    """서버 DB에서 이전 채팅 기록을 가져옵니다."""
    try:
        with urllib.request.urlopen(f"{http_base}/history", timeout=5) as resp:
            data = json.loads(resp.read())
        messages = data.get("messages", [])
        history = [{"role": m["sender"], "content": m["content"]} for m in messages]
        print(f"[{name}] 이전 대화 {len(history)}개 로드 완료")
        return history
    except Exception as e:
        print(f"[{name}] 히스토리 로드 실패 (빈 상태로 시작): {e}")
        return []


def _fetch_prompts(http_base: str, name: str) -> tuple[str, str]:
    """서버에서 공통 프롬프트와 에이전트별 프롬프트를 가져옵니다."""
    try:
        with urllib.request.urlopen(f"{http_base}/prompts", timeout=5) as resp:
            data = json.loads(resp.read())
        return data.get("common", ""), data.get(name, "")
    except Exception as e:
        print(f"[{name}] 프롬프트 로드 실패 (기본값 사용): {e}")
        return "", ""


def _fetch_settings(http_base: str, name: str) -> dict:
    """서버에서 설정값을 가져옵니다."""
    try:
        with urllib.request.urlopen(f"{http_base}/settings", timeout=5) as resp:
            data = json.loads(resp.read())
        print(f"[{name}] 설정 로드 완료")
        return data
    except Exception as e:
        print(f"[{name}] 설정 로드 실패 (기본값 사용): {e}")
        return {}


async def _extract_and_store(
    name: str,
    history_window: list[dict],
    memory: MemoryManager,
    extract_fn,
) -> None:
    """응답 후 백그라운드에서 기억 추출 및 저장."""
    if len(history_window) < 2:
        return
    conv = "\n".join(
        f"[{'사용자' if m['role'] == 'user' else m['role'].upper()}]: {m['content'][:200]}"
        for m in history_window[-6:]
    )
    prompt = EXTRACT_PROMPT.format(conversation=conv)
    try:
        raw = await extract_fn(prompt)
        if not raw.strip():
            return
        for line in raw.splitlines():
            fact = line.strip().lstrip("-•*0123456789. ").strip()
            if len(fact) > 5:
                source = history_window[-1]["role"] if history_window else "chat"
                stored = await memory.add(fact, source=source)
                if stored:
                    print(f"[{name}] 기억 저장: {fact[:60]}")
                else:
                    print(f"[{name}] 기억 중복 스킵: {fact[:40]}")
    except Exception as e:
        print(f"[{name}] 기억 추출 실패 ({type(e).__name__}): {e}")


async def run(name: str, server: str) -> None:
    uri = f"{server}/ws/join/{name}"
    http_base = server.replace("ws://", "http://").replace("wss://", "https://")
    stream_fn = STREAM_FNS[name]
    extract_fn = EXTRACT_FNS[name]
    debate_active = False
    predecessor = DEBATE_PREDECESSOR[name]

    history = _fetch_history(http_base, name)
    common_prompt, agent_prompt = _fetch_prompts(http_base, name)
    settings = _fetch_settings(http_base, name)
    short_term_count = int(settings.get("short_term_turns", "20"))

    memory = MemoryManager(name)
    mem_count = memory.count()

    print(f"[{name}] 프롬프트 로드 완료 (공통: {len(common_prompt)}자, 개별: {len(agent_prompt)}자)")
    print(f"[{name}] 단기기억: 최근 {short_term_count}개 메시지 / 장기기억: {mem_count}개")
    print(f"[{name}] {uri} 에 접속 중...")

    async with websockets.connect(uri) as ws:
        print(f"[{name}] 채팅방 입장 완료. 메시지 대기 중...")

        async for raw in ws:
            data = json.loads(raw)
            event = data.get("type")
            sender = data.get("sender", "")

            if event == "error":
                print(f"[{name}] 오류: {data.get('message')}")
                return

            elif event == "kicked":
                print(f"[{name}] 방에서 내보내짐")
                return

            elif event == "participants":
                print(f"[{name}] 현재 참가자: {data['list']}")

            elif event == "join":
                print(f"[{name}] >> {data['name']} 입장")

            elif event == "leave":
                print(f"[{name}] << {data['name']} 퇴장")

            elif event == "debate_start":
                debate_active = True
                print(f"[{name}] 자율 토론 모드 시작 (최대 {data.get('max_turns')}턴)")

            elif event == "debate_end":
                debate_active = False
                print(f"[{name}] 자율 토론 종료: {data.get('reason')} (라운드: {data.get('round')})")

            elif event == "message" and sender != name:
                content: str = data.get("content", "")
                print(f"[{name}] [{sender}]: {content[:80]}")

                history.append({"role": sender, "content": content})

                # user 메시지 또는 (토론 모드에서 predecessor 메시지)에 응답
                should_respond = (sender == "user") or (debate_active and sender == predecessor)

                if should_respond:
                    print(f"[{name}] 응답 생성 중...")

                    # 단기기억 슬라이딩 윈도우
                    history_window = history[-short_term_count:]

                    # 장기기억 검색
                    memories = await memory.search(content, top_k=5)
                    if memories:
                        print(f"[{name}] 장기기억 {len(memories)}개 참조")

                    full = ""
                    try:
                        async for chunk in stream_fn(
                            content, history_window[:-1], {},
                            common_prompt, agent_prompt, sender,
                            debate_active, memories,
                        ):
                            full += chunk
                            await ws.send(json.dumps(
                                {"type": "chunk", "content": chunk},
                                ensure_ascii=False,
                            ))
                    except Exception as e:
                        print(f"[{name}] 스트리밍 오류: {e}")
                        full = "[오류 발생]"

                    final = full.strip() or "[pass]"
                    await ws.send(json.dumps(
                        {"type": "message", "content": final},
                        ensure_ascii=False,
                    ))
                    history.append({"role": name, "content": final})
                    print(f"[{name}] 응답 완료: {final[:60]}...")

                    # 백그라운드에서 기억 추출 (대화 흐름에 영향 없음)
                    asyncio.create_task(
                        _extract_and_store(name, history[-short_term_count:], memory, extract_fn)
                    )


def main() -> None:
    parser = argparse.ArgumentParser(description="AI 에이전트 채팅 참가 클라이언트")
    parser.add_argument("--name", required=True, choices=list(STREAM_FNS), help="에이전트 이름")
    parser.add_argument("--server", default="ws://localhost:8092", help="채팅 서버 WebSocket URL")
    args = parser.parse_args()

    try:
        asyncio.run(run(args.name, args.server))
    except KeyboardInterrupt:
        print(f"\n[{args.name}] 종료")
    except ConnectionClosed:
        print(f"[{args.name}] 서버 연결 끊김")


if __name__ == "__main__":
    main()
