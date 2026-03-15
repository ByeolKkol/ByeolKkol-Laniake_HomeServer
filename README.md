# Laniake HomeServer

ROG Ally 기반 홈 서버 올인원 관리 시스템.
CHZZK 자동 녹화, 서버 하드웨어 제어, WOL 전원 관리, AI 다중 에이전트 토론을 하나의 웹 UI로 제공합니다.

---

## 서비스 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| **nginx-files** | 8080 | 프론트엔드 (React + TypeScript) |
| **chzzk-backend** | 8000 | CHZZK 자동 녹화 · Google Drive 업로드 |
| **rog-ctrl-backend** | 8090 | ROG Ally 하드웨어 제어 (배터리 · 팬 · 화면) |
| **wol-backend** | — | WOL · SSH 전원 제어 (host network) |
| **ai-discussion** | 8092 | AI 다중 에이전트 토론 서버 |
| **chzzk-db** | 5432 | PostgreSQL |

---

## 주요 기능

### CHZZK 녹화
- 채널 등록 및 자동 녹화 (스트림 시작 감지)
- 품질 설정 (best / 1080p / 720p / 480p / 360p)
- 녹화 완료 후 Google Drive 자동 업로드
- 녹화 이력 조회 및 관리

### 서버 컨트롤 (ROG Ally)
- CPU 사용률 · 온도 · 메모리 · 디스크 실시간 모니터링
- 배터리 충전 제한 설정
- 팬 프로파일 전환 (asusctl)
- 화면 전원 제어

### WOL / PC 전원
- Wake-on-LAN 패킷 전송
- SSH를 통한 원격 종료 · 재시작
- 온라인 상태 실시간 확인

### AI 토론 (Claude · Gemini · Codex)
- WebSocket 기반 실시간 스트리밍 채팅
- 자율 토론 모드 (라운드 기반, 합의 시 자동 종료)
- **장기 기억**: Milvus Lite + sentence-transformers 다국어 임베딩
  - 대화 후 자동 기억 추출 (fire-and-forget)
  - 코사인 유사도 기반 중복 방지 (threshold 0.88)
  - `memory_cli.py`로 기억 조회 · 삭제 · 검색
- 에이전트별 시스템 프롬프트 커스터마이징
- 단기 기억 턴 수 설정 (웹 UI)

---

## 프로젝트 구조

```
Laniake_HomeServer/
├── main/               # React + TypeScript 프론트엔드
│   └── src/
│       ├── App.tsx
│       ├── useChzzkData.ts
│       ├── AiDiscussionTab.tsx
│       └── ...
├── cz-recording/       # CHZZK 녹화 백엔드 (FastAPI)
├── servercontrol/      # ROG Ally 하드웨어 제어 (FastAPI)
├── wolservice/         # WOL / 전원 제어 (FastAPI)
├── ai-discussion/      # AI 토론 서버 (FastAPI + WebSocket)
│   ├── agents/
│   │   ├── memory.py       # Milvus Lite 장기기억
│   │   ├── claude_agent.py
│   │   ├── gemini_agent.py
│   │   └── codex_agent.py
│   ├── agent_client.py     # 에이전트 채팅 참여 클라이언트 (로컬 실행)
│   ├── memory_cli.py       # 기억 관리 CLI
│   └── requirements.txt
└── docker-compose.yml
```

---

## 실행 방법

### 서버 (ROG Ally)

```bash
docker compose up -d
```

### AI 에이전트 클라이언트 (Mac 로컬)

```bash
cd ai-discussion
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python agent_client.py --name claude --server ws://192.168.1.89:8092
python agent_client.py --name gemini --server ws://192.168.1.89:8092
python agent_client.py --name codex  --server ws://192.168.1.89:8092
```

### 기억 관리 CLI

```bash
python memory_cli.py --agent claude list
python memory_cli.py --agent claude search "검색어"
python memory_cli.py --agent claude delete <id>
python memory_cli.py --agent claude count
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18, TypeScript, Vite, Tailwind CSS |
| 백엔드 | FastAPI, Python 3.12 |
| DB | PostgreSQL 15, Milvus Lite |
| AI | Claude (claude-code CLI), Gemini CLI, OpenAI Codex |
| 임베딩 | sentence-transformers `paraphrase-multilingual-MiniLM-L12-v2` |
| 인프라 | Docker Compose, nginx |
| 하드웨어 | ROG Ally (asusctl v6.3.4) |
