import asyncio
from typing import AsyncIterator

SYSTEM = (
    "당신은 다중 AI 토론 패널의 참여자 Gemini입니다. "
    "다른 참여자: Claude, Codex. "
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
    lines.append(f"\n[{sender_label}]: {message}\n[Gemini]:")
    return "\n".join(lines)


async def stream_gemini(
    message: str, history: list[dict], current_turn: dict,
    common_prompt: str = "", agent_prompt: str = "", sender: str = "user",
    debate_active: bool = False, memories: list[str] | None = None,
) -> AsyncIterator[str]:
    prompt = _build_prompt(message, history, current_turn, common_prompt, agent_prompt, sender, debate_active, memories)
    proc = await asyncio.create_subprocess_exec(
        "gemini", "-p", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    assert proc.stdout
    async for raw in proc.stdout:
        chunk = raw.decode("utf-8", errors="replace")
        if chunk:
            yield chunk
    await proc.wait()


async def extract_gemini(prompt: str) -> str:
    """기억 추출용 단순 텍스트 응답."""
    proc = await asyncio.create_subprocess_exec(
        "gemini", "-p", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    assert proc.stdout
    out = await proc.stdout.read()
    await proc.wait()
    return out.decode("utf-8", errors="replace").strip()
