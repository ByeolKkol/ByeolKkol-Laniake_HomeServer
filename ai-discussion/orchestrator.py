import asyncio
from typing import AsyncIterator, Callable

from agents.claude_agent import stream_claude
from agents.gemini_agent import stream_gemini
from agents.codex_agent import stream_codex

AGENTS = [
    ("claude", stream_claude),
    ("gemini", stream_gemini),
    ("codex", stream_codex),
]


async def run_turn(
    message: str,
    history: list[dict],
    on_chunk: Callable[[str, str], None],
) -> dict[str, str]:
    """
    Run one discussion turn: each agent responds sequentially.
    on_chunk(agent_name, text_chunk) is called for each streaming chunk.
    Returns {agent_name: full_response}.
    """
    current_turn: dict[str, str] = {}

    for agent_name, stream_fn in AGENTS:
        full_response = ""
        async for chunk in stream_fn(message, history, current_turn):
            full_response += chunk
            on_chunk(agent_name, chunk)

        # [pass] 처리: 공백 제거 후 판단
        stripped = full_response.strip()
        if stripped.lower() == "[pass]" or stripped == "":
            current_turn[agent_name] = "[pass]"
        else:
            current_turn[agent_name] = stripped

    return current_turn
