#!/usr/bin/env bash
# AI 채팅방 서버 실행 (MacBook에서 실행)
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

echo "채팅방 서버 시작: ws://0.0.0.0:8092"
echo ""
echo "에이전트 접속 방법 (별도 터미널):"
echo "  .venv/bin/python agent_client.py --name claude"
echo "  .venv/bin/python agent_client.py --name gemini"
echo "  .venv/bin/python agent_client.py --name codex"
echo ""
echo "다른 컴퓨터에서 접속:"
echo "  python agent_client.py --name claude --server ws://$(ipconfig getifaddr en0 2>/dev/null || echo 'YOUR_IP'):8092"
echo ""

.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8092 --reload
