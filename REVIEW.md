# Laniake HomeServer 백엔드 코드 리뷰

> 작성일: 2026-03-16
> 분석 대상: cz-recording, servercontrol, wolservice, ai-discussion

---

## 목차

1. [CHZZK 녹화 백엔드 (cz-recording)](#1-chzzk-녹화-백엔드-cz-recording)
2. [ROG Ally 하드웨어 제어 (servercontrol)](#2-rog-ally-하드웨어-제어-servercontrol)
3. [WOL/전원 제어 (wolservice)](#3-wol전원-제어-wolservice)
4. [AI 토론 서버 (ai-discussion)](#4-ai-토론-서버-ai-discussion)
5. [공통 개선 사항](#5-공통-개선-사항)
6. [우선순위 정리](#6-우선순위-정리)
7. [정량적 분석](#7-정량적-분석)

---

## 1. CHZZK 녹화 백엔드 (`cz-recording`)

### 1.1 아키텍처 및 코드 구조

**장점:**
- 계층화된 구조: models → database → services → routes → main으로 명확한 계층 분리
- Recording, Channel, Cookie, UploadLog 등 도메인 모델 구분
- `asyncio`를 활용한 concurrent recording/upload 처리 (최대 5개 동시 녹화)
- `app.state`를 통한 runtime state 관리 (recording_tasks, upload_status 등)
- FastAPI 0.93+ lifespan context manager로 startup/shutdown 로직 명확

**문제점:**
- **main.py 923줄**: `_serialize_recording()`, `_serialize_channel()`, `_serialize_upload()` 등이 분리되지 않아 200줄 모듈화 규칙 심각 위반
- ChzzkScanner ↔ main.py 간 강한 순환 의존성
- DB 세션 관리 패턴 혼재: `Depends(get_db)` 사용과 수동 `SessionLocal()` 생성이 함수별로 불일치

### 1.2 보안 이슈

**🔴 심각**

**1. 인증/권한 부재**
```python
allow_origins=["*"]
allow_credentials=False
```
- 모든 CORS 허용 → 악의적 도메인에서 API 접근 가능
- 쿠키 업로드/조회 엔드포인트가 인증 없이 노출
- NID_AUT, NID_SES 쿠키는 개인 계정 인증 정보

**2. 쿠키 평문 저장**
```python
class Cookie(Base):
    cookie_value = Column(Text, nullable=False)  # 암호화 없음
```
- NID_AUT, NID_SES 쿠키가 DB에 평문으로 저장
- DB 유출 시 사용자 계정 탈취 가능
- 개선: `sqlalchemy-utils`의 `EncryptedType` 또는 Fernet 암호화

**3. 시크릿 파일 경로**
```python
GOOGLE_DRIVE_CREDENTIALS_FILE = Path(
    os.getenv("GOOGLE_DRIVE_CREDENTIALS_FILE",
              str(BASE_DIR / "credentials.json"))  # 기본값이 프로젝트 내부
)
```
- credentials.json, settings.yaml이 BASE_DIR에 저장되면 git 체크인 위험
- `.gitignore` 의존만으로 보호

**4. SSRF 취약점**
```python
@app.get("/proxy/thumbnail")
async def proxy_thumbnail(url: str = Query(...)) -> Response:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:  # scheme만 확인
        raise HTTPException(status_code=400, ...)
    # 내부 IP (127.0.0.1, 192.168.x.x) 접근 가능
```
- URL 검증이 scheme만 확인 → SSRF 공격 가능
- `127.0.0.1`, `192.168.x.x` 등 내부 IP 필터링 필요

**5. 입력 검증 불일치**
```python
class ChannelCreate(BaseModel):
    channel_id: str = Field(min_length=3, max_length=64)  # 검증 있음
    quality: str = "best"  # enum 미사용, 수동 검증만 함
```

### 1.3 에러 핸들링

```python
# 예외 메시지를 title 필드에 저장
except Exception as exc:
    recording.title = recording.title or str(exc)  # 오염 위험

# 비동기 작업 예외 무시
asyncio.create_task(_finalize_recording_task(...))  # 반환값 미사용
```

- 광범위 catch-all로 예외 유형 구분 불가
- 비동기 태스크 예외가 조용히 무시될 수 있음
- DB 세션 정리: `db.close()`만 사용, SQLAlchemy 권장의 `scoped_session()` 미사용

### 1.4 성능 이슈

- **업로드 동시성 무제한**: 녹화는 `Semaphore(5)` 제한이 있지만 Google Drive 업로드는 제한 없음
- **`upload_status` 딕셔너리 누수**: shutdown까지 정리 로직 없이 누적

---

## 2. ROG Ally 하드웨어 제어 (`servercontrol`)

### 2.1 아키텍처 및 코드 구조

**장점:**
- 깔끔한 라우터 분리: battery, display, led, profile, status, metrics
- 서비스 계층 명확: `asusctl`, `sysfs`, `sysinfo` 모듈 분리
- 모든 함수에 타입 힌트, `Literal` 타입 사용

```python
class ProfileRequest(BaseModel):
    profile: Literal["Quiet", "Balanced", "Performance"]
```

**문제점:**

**순차 await (성능 저하)**
```python
@router.get("/status")
async def get_status() -> HardwareStatus:
    battery_limit, profile, battery_capacity, cpu_temp = (
        await asusctl.get_battery_limit(),  # 1초 대기
        await asusctl.get_profile(),        # 1초 대기
        ...
    )
    # 총 2초+ 소요, asyncio 이점 없음
```
→ `asyncio.gather()`로 병렬화 필요

**sysfs 경로 하드코딩**
```python
_BACKLIGHT_DIR = Path("/sys/class/backlight/amdgpu_bl1")  # GPU 모델 고정
```
→ `glob()`으로 동적으로 찾는 방식 필요

### 2.2 보안 이슈

- **CORS 전체 허용**: 모든 서비스 공통 문제
- asusctl 명령어 인젝션은 고정 문자열 사용으로 불가능 ✓
- Pydantic이 `0 <= brightness <= 100` 검증 ✓

### 2.3 에러 핸들링

```python
async def get_battery_limit() -> int | None:
    try:
        output = await _run("battery", "info")
        ...
    except Exception:
        return None  # 정상/오류 구분 불가
```
- 오류 시 `None` 반환 → 클라이언트가 정상 응답인지 오류인지 구분 불가
- 별도 status 필드 또는 HTTPException 발생 권장

### 2.4 성능

- `re.search(r"(\d+)%", output)`: 매 요청마다 regex 컴파일 (모듈 레벨 상수로 캐시 권장)

---

## 3. WOL/전원 제어 (`wolservice`)

### 3.1 아키텍처 및 코드 구조

**장점:**
- 간단한 구조: 모델 → 서비스 → 라우터로 명확
- 파일 기반 저장소로 외부 DB 불필요
- SSH와 WOL 서비스 분리

**문제점:**

**파일 동시 쓰기 (TOCTOU)**
```python
def _load() -> list[WolTarget]:
    return [WolTarget(**item) for item in json.loads(_DATA_FILE.read_text())]

def _save(targets: list[WolTarget]) -> None:
    _DATA_FILE.write_text(...)  # 두 요청이 동시에 실행 시 데이터 손실
```

**매 요청마다 전체 파일 로드**
```python
def get_target(target_id: str) -> WolTarget | None:
    return next((t for t in _load() if ...), None)
    # _load()가 매번 JSON 전체 파일을 읽음
```

### 3.2 보안 이슈

**🔴 심각**

**1. SSH 비밀번호 평문 저장**
```python
class WolTarget(BaseModel):
    ssh_password: str | None = None  # wol_targets.json에 평문 저장
```
- 파일 노출 시 모든 원격 PC 접근 권한 상실

**2. SSH 호스트 키 검증 비활성화**
```python
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
# 중간자 공격(MITM)에 취약
```

**3. CORS 전체 허용** (공통)

### 3.3 에러 핸들링

```python
def _run_via_shell(client: paramiko.SSHClient, cmd: str) -> None:
    chan.recv(4096)     # 버퍼 오버플로우 가능
    time.sleep(1.5)    # 하드코딩된 대기시간 (불안정)
```

---

## 4. AI 토론 서버 (`ai-discussion`)

### 4.1 아키텍처 및 코드 구조

**특징:**
- 다중 에이전트 오케스트레이션: Claude, Gemini, Codex
- WebSocket 기반 스트리밍
- Milvus Lite + sentence-transformers 장기 메모리

**문제점:**

**stderr 무시**
```python
proc = await asyncio.create_subprocess_exec(
    "claude", "-p", prompt,
    stderr=asyncio.subprocess.DEVNULL,  # 디버깅 불가
)
```

**환경변수 전체 전달**
```python
env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
# CLAUDECODE 하나만 제외하고 모든 환경변수 subprocess에 전달
# API 키, 시크릿 등 노출 위험
```

### 4.2 보안 이슈

**프롬프트 주입 취약점**
```python
def _build_prompt(message: str, history: list[dict], ...):
    lines.append(f"[{sender_label}]: {message}\n[Claude]:")
    # message가 직접 프롬프트에 주입됨
    # "[AGREE]", "[DISAGREE]" 태그 조작 가능
```

- 프롬프트 길이 제한 없음
- 메모리 검색 쿼리 검증 없음

### 4.3 성능 이슈

- **동기 임베딩**: `_get_model().encode()` 블로킹 → `run_in_executor` 처리 ✓ (단, 순차 처리)
- **매 저장마다 중복 체크**: Milvus 쿼리 발생 (배치 처리 미지원)
- **Milvus 데이터 무한 증가**: 정리 정책 없음

---

## 5. 공통 개선 사항

### 5.1 인증/권한 추가

```python
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthCredentials

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthCredentials = Depends(security)):
    token = credentials.credentials
    # JWT 검증 또는 API Key 검증
    return user_id

@app.get("/recordings")
async def list_recordings(user_id: str = Depends(verify_token)):
    ...
```

### 5.2 Enum 타입 강화

```python
# Before
class RecordingUpdate(BaseModel):
    status: str | None = None

# After
class RecordingUpdate(BaseModel):
    status: Literal["pending", "recording", "completed", "failed", "cancelled"] | None = None
```

### 5.3 DB 마이그레이션 (Alembic)

```bash
alembic init alembic
alembic revision --autogenerate -m "add quality column"
alembic upgrade head
```

### 5.4 에러 응답 표준화

```python
from enum import Enum

class ErrorCode(str, Enum):
    INVALID_INPUT = "INVALID_INPUT"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"

class APIError(BaseModel):
    error_code: ErrorCode
    message: str
    details: dict[str, Any] | None = None
```

### 5.5 비동기 병렬 처리 (servercontrol)

```python
# Before (순차, 2초+)
battery_limit = await asusctl.get_battery_limit()
profile = await asusctl.get_profile()

# After (병렬, ~1초)
battery_limit, profile = await asyncio.gather(
    asusctl.get_battery_limit(),
    asusctl.get_profile(),
)
```

---

## 6. 우선순위 정리

### 🔴 즉시 조치

| 항목 | 서비스 | 설명 |
|------|--------|------|
| 인증/권한 추가 | 전체 | API 키 또는 JWT 기반 인증 |
| 쿠키 암호화 저장 | cz-recording | NID_AUT/NID_SES Fernet 암호화 |
| SSH 비밀번호 암호화 | wolservice | 평문 JSON 저장 제거 |
| SSH 호스트 키 검증 | wolservice | `AutoAddPolicy()` → `RejectPolicy()` + known_hosts |
| SSRF 방지 | cz-recording | 내부 IP 필터링 추가 |

### 🟡 단기 개선

| 항목 | 서비스 | 설명 |
|------|--------|------|
| main.py 모듈화 | cz-recording | 200줄 이하 분리 |
| 업로드 Semaphore | cz-recording | 동시 업로드 수 제한 |
| asyncio.gather() 적용 | servercontrol | 순차 await → 병렬 |
| 파일 동시성 처리 | wolservice | 파일 잠금 또는 SQLite 전환 |
| 환경변수 화이트리스트 | ai-discussion | subprocess에 필요한 변수만 전달 |

### 🟢 장기 개선

| 항목 | 서비스 | 설명 |
|------|--------|------|
| Alembic 마이그레이션 | cz-recording | 수동 ALTER TABLE 제거 |
| 구조화된 로깅 | 전체 | JSON 로그 + 상관 ID |
| 에러 응답 표준화 | 전체 | ErrorCode enum 통일 |
| Milvus 정리 정책 | ai-discussion | 오래된 메모리 자동 삭제 |

---

## 7. 정량적 분석

| 메트릭 | cz-recording | servercontrol | wolservice | ai-discussion |
|--------|:---:|:---:|:---:|:---:|
| 총 라인 수 | ~2,000 | ~400 | ~300 | ~400 |
| 타입 힌트 커버리지 | ~95% | 100% | 95% | 90% |
| Pydantic 모델 수 | 7개 | 6개 | 3개 | 0개 |
| 보안 이슈 수 | 6개 | 2개 | 4개 | 3개 |
| 성능 이슈 수 | 3개 | 2개 | 2개 | 2개 |

---

## 결론

모든 서비스가 기본적인 FastAPI 패턴을 따르고 있으나 **보안과 모듈화** 측면에서 개선이 필요합니다.

- **즉시**: 인증/권한 추가, 시크릿 암호화 (쿠키, SSH 비밀번호)
- **단기**: 코드 모듈화 (main.py 분리), 성능 최적화 (asyncio.gather)
- **장기**: Alembic 마이그레이션, 구조화된 로깅, 에러 표준화
