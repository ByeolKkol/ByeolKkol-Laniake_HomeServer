import asyncio
import json
import os
from typing import AsyncIterator

SYSTEM = (
    "당신은 다중 AI 토론 패널의 참여자 Claude입니다. "
    "다른 참여자: Gemini, Codex. "
    "사용자 의견에 3-5문장으로 간결하게 응답하세요. "
    "추가할 내용이 없으면 '[pass]'만 출력하세요. "
    "자율 토론 모드에서는 반드시 응답 마지막 줄에 [AGREE] 또는 [DISAGREE]를 표시하세요."
)


def _build_system(common_prompt: str, agent_prompt: str) -> str:
    base = agent_prompt.strip() if agent_prompt.strip() else SYSTEM
    extra = common_prompt.strip()
    return f"{base}\n\n{extra}" if extra else base


def _build_prompt(
    message: str, history: list[dict], current_turn: dict,
    common_prompt: str = "", agent_prompt: str = "", sender: str = "user",
    debate_active: bool = False, memories: list[str] | None = None,
) -> str:
    lines = [_build_system(common_prompt, agent_prompt), ""]
    if debate_active:
        lines.append("[시스템]: 현재 자율 토론 모드입니다. 반드시 응답 마지막 줄에 [AGREE] 또는 [DISAGREE]를 표시하세요.")
    else:
        lines.append("[시스템]: 현재 일반 대화 모드입니다.")
    lines.append("")
    if memories:
        lines.append("[장기 기억 안내]: 아래는 과거 대화에서 추출된 기억입니다. 자연스럽게 대화에 반영하세요. 억지로 언급하지 말고, 관련 있을 때만 자연스럽게 활용하세요.")
        for m in memories:
            lines.append(f"- {m}")
        lines.append("")
    for item in history:
        role = "사용자" if item["role"] == "user" else item["role"].upper()
        lines.append(f"[{role}]: {item['content']}")
    if current_turn:
        lines.append("\n--- 이번 턴 다른 AI 응답 ---")
        for ai, resp in current_turn.items():
            lines.append(f"[{ai.upper()}]: {resp}")
    sender_label = "사용자" if sender == "user" else sender.upper()
    lines.append(f"\n[{sender_label}]: {message}\n[Claude]:")
    return "\n".join(lines)


async def stream_claude(
    message: str, history: list[dict], current_turn: dict,
    common_prompt: str = "", agent_prompt: str = "", sender: str = "user",
    debate_active: bool = False, memories: list[str] | None = None,
) -> AsyncIterator[str]:
    prompt = _build_prompt(message, history, current_turn, common_prompt, agent_prompt, sender, debate_active, memories)
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--no-session-persistence",
        "--effort", "low",
        "--dangerously-skip-permissions",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env=env,
    )
    assert proc.stdout

    async for raw in proc.stdout:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            msg_type = data.get("type", "")
            if msg_type == "content_block_delta":
                delta = data.get("delta", {})
                if delta.get("type") == "text_delta":
                    yield delta.get("text", "")
            elif msg_type == "assistant":
                for block in data.get("message", {}).get("content", []):
                    if block.get("type") == "text":
                        yield block.get("text", "")
        except (json.JSONDecodeError, AttributeError):
            if line and not line.startswith("{"):
                yield line + "\n"

    await proc.wait()


async def extract_claude(prompt: str) -> str:
    """기억 추출용 단순 텍스트 응답."""
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", prompt,
        "--output-format", "text",
        "--no-session-persistence",
        "--effort", "low",
        "--dangerously-skip-permissions",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env=env,
    )
    assert proc.stdout
    out = await proc.stdout.read()
    await proc.wait()
    return out.decode("utf-8", errors="replace").strip()
