# Laniake HomeServer 코드 리뷰 및 수정 계획

> 리뷰 일자: 2026-03-24
> 상태: 진행 중

---

## 1. 보안 이슈

### 1-1. SQL Injection 위험 (Critical)
- **파일**: `servercontrol/services/metrics_store.py:39`
- **내용**: f-string으로 SQL 컬럼명 삽입 → SQL injection 가능
- **수정**: 컬럼명 화이트리스트 검증
- **상태**: [x] 수정 완료 (화이트리스트 검증 추가)

### 1-2. PostgreSQL 인증 없음 (Critical)
- **파일**: `docker-compose.yml:9`
- **내용**: `POSTGRES_HOST_AUTH_METHOD: trust` → 비밀번호 없이 DB 접근 가능
- **수정**: `POSTGRES_PASSWORD` 환경변수 인증으로 전환, 6개 서비스 DATABASE_URL에 비밀번호 반영, `.env.example` 추가
- **상태**: [x] 수정 완료

### 1-3. SSRF 방어 없음 (High)
- **파일**: `cz-recording/routers/proxy.py:14-41`
- **내용**: 프록시 엔드포인트에서 내부 IP(10.x, 172.x, 192.168.x) 접근 차단 없음
- **수정**: 도메인 화이트리스트 + `ipaddress.is_global` 체크 추가
- **상태**: [x] 수정 완료

---

## 2. 가비지 코드 / 데드 코드

### 2-1. 미사용 prop 파라미터
- **파일**: `main/src/ChzzkAccountTab.tsx:25`
- **내용**: `onUploadDriveSession`을 `_`로 받고 미사용
- **수정**: prop 제거 또는 UI에 세션 업로드 기능 연결
- **상태**: [x] 수정 완료 (prop 제거)

### 2-2. 빈 함수 잔존
- **파일**: `cz-recording/database.py:25-32`
- **내용**: `ensure_upload_schema()`, `ensure_channel_schema()` 본문이 `pass`
- **수정**: 함수 삭제 + `main.py`, `db_check_and_repair.py` 호출부 정리
- **상태**: [x] 수정 완료

### 2-3. Dockerfile 중복 설치
- **파일**: `cz-recording/Dockerfile:13`
- **내용**: `uvicorn`, `psycopg2-binary` 등 requirements.txt과 중복 설치. `gspread`, `oauth2client`, `pyyaml`, `streamlink`은 requirements.txt에 미기재
- **수정**: requirements.txt로 통합, Dockerfile 중복 라인 제거
- **상태**: [x] 수정 완료

### 2-4. 로그 파일 잔존
- **파일**: `ai-discussion/gemini_agent.log`, `gemini_chat.log`, `gemini_agent_new.log`
- **내용**: .gitignore에 `*.log` 있으나 파일이 남아있음
- **수정**: 파일 삭제
- **상태**: [x] 삭제 완료

---

## 3. 코드 중복 (DRY 위반)

### 3-1. 프론트 API request() 함수 5중 복붙
- **파일**: `serverApi.ts`, `wolApi.ts`, `iotApi.ts`, `tapoApi.ts`, `electricityApi.ts`
- **내용**: 동일한 `request<T>()` 헬퍼가 5개 파일에 복사
- **수정**: `fetchJson.ts`의 `createRequest()` 팩토리로 추출
- **상태**: [x] 수정 완료

### 3-2. crypto.py 100% 중복
- **파일**: `cz-recording/crypto.py` ↔ `wolservice/crypto.py`
- **내용**: Fernet 암호화 코드 완전 동일
- **수정**: 별도 서비스이므로 현상 유지 가능 (공유 라이브러리 도입 시 통합)
- **상태**: [-] 보류 (독립 서비스 구조상 수용)

### 3-3. HealthState 타입 중복
- **파일**: `useChzzkData.ts:24` ↔ `ChzzkOverviewTab.tsx:9`
- **내용**: 동일 타입이 두 파일에 정의
- **수정**: `types.ts`에 통합, 3곳 로컬 정의 제거
- **상태**: [x] 수정 완료

---

## 4. 타입 안전성

### 4-1. `undefined as T` 패턴 (프론트)
- **파일**: 5개 API 파일의 `request<T>()` 내부
- **내용**: 204 응답 시 `return undefined as T` → 타입 우회
- **수정**: 3-1에서 `createRequest` 도입으로 함께 해결
- **상태**: [x] 수정 완료

### 4-2. 백엔드 타입 힌트 누락
- **파일**: `tapo_poller.py:48` (`_poll_local` 반환), `tapo_poller.py:27` (`_upsert_devices`)
- **내용**: 반환 타입 미지정
- **수정**: `PollResult` TypedDict 추가, `_upsert_devices` 파라미터 타입 보완
- **상태**: [x] 수정 완료

---

## 5. 에러 처리

### 5-1. 프론트 에러 무시 (12곳+)
- **파일**: `useChzzkData.ts`, `IotTab.tsx`, `TapoSection.tsx`, `SettingsTab.tsx`, `AiDiscussionTab.tsx`
- **내용**: `.catch(() => undefined)` 로 에러 삼킴 → 사용자 피드백 없음
- **수정**: `console.warn` 으로 전환 (의도된 폴백인 `fetchJson.ts`, `HealthTab.tsx`, `WolTab.tsx` 제외)
- **상태**: [x] 수정 완료

### 5-2. 백엔드 bare except + pass
- **파일**: `tapo-backend/main.py:19-20`, `servercontrol/main.py:46-47`
- **내용**: `except Exception: pass` 로 에러 완전 무시
- **수정**: `logger.exception()` 추가
- **상태**: [x] 수정 완료

---

## 6. 함수/컴포넌트 크기 초과 (>50줄)

| 파일 | 함수 | 줄 수 | 상태 |
|------|------|-------|------|
| `cz-recording/services/recording_service.py` | `finalize_recording_task()` | 96→39 | [x] `_fill_file_info_from_path`, `_enqueue_drive_upload` 추출 |
| `cz-recording/services/recording_service.py` | `start_recording_for_channel()` | 81→34 | [x] `_prepare_recording` + `_RecordingContext` 추출 |
| `cz-recording/uploader.py` | `upload_to_drive()` | 98→27 | [x] `_perform_chunked_upload`, `_finalize_upload` 추출 |
| `main/src/AiDiscussionTab.tsx` | 컴포넌트 전체 | 604→199 | [x] `StatusBar`, `PromptPanel`, `ChatView` 서브컴포넌트 분리 |

---

## 7. 인프라 / 설정

### 7-1. cz-recording 의존성 버전 미고정 (High)
- **파일**: `cz-recording/requirements.txt`
- **내용**: 전체 패키지 버전 미지정 (다른 백엔드는 모두 고정)
- **수정**: 현재 설치 버전 기준으로 고정
- **상태**: [x] 수정 완료

### 7-2. 서비스 간 pydantic 버전 불일치
- **내용**: `2.9.2` (servercontrol, wolservice) vs `2.7.4` (iot, tapo, health)
- **수정**: 전체 `2.9.2`로 통일
- **상태**: [x] 수정 완료

### 7-3. ai-discussion DB 호스트명 불일치
- **파일**: `docker-compose.yml:144`
- **내용**: `chzzk-db` (container_name) 직접 참조. 다른 서비스는 `db` 사용
- **수정**: `db`로 통일
- **상태**: [x] 수정 완료

### 7-4. rog-ctrl-backend networks 미선언
- **파일**: `docker-compose.yml`
- **내용**: 다른 서비스는 명시적 networks 선언, 이 서비스만 누락
- **수정**: `networks: [default]` 추가
- **상태**: [x] 수정 완료

---

## 8. 동시성 / 레이스 컨디션

### 8-1. scanner 상태 dict 동기화 없음
- **파일**: `cz-recording/scanner.py:131-137`
- **내용**: `_last_live_state`, `_thumbnail_cache` lock 없이 변경
- **수정**: asyncio 단일 스레드이므로 실질적 위험 낮음. 코멘트 추가로 의도 명확화
- **상태**: [-] 보류 (asyncio 특성상 안전)

### 8-2. tapo_poller 전역 변수
- **파일**: `tapo-backend/tapo_poller.py:14`
- **내용**: `_cloud` 전역 변수 lock 없이 수정
- **수정**: 8-1과 동일 사유로 보류
- **상태**: [-] 보류

---

## 수정 우선순위

### Phase 1 — 즉시 (안전성 + 빌드 안정성)
1. [x] `cz-recording/requirements.txt` 버전 고정 + Dockerfile 정리 (7-1, 2-3)
2. [x] `metrics_store.py` SQL injection 수정 — 화이트리스트 검증 추가 (1-1)
3. [x] `database.py` 데드 함수 삭제 + `main.py`, `db_check_and_repair.py` 호출부 정리 (2-2)
4. [x] `ai-discussion/*.log` 파일 삭제 (2-4)

### Phase 2 — 단기 (코드 품질)
5. [x] 프론트 `request<T>()` → `fetchJson.ts`의 `createRequest()` 공통 유틸로 추출 (3-1, 4-1)
6. [x] `HealthState` 타입 `types.ts`로 통합, 3곳 로컬 정의 제거 (3-3)
7. [x] `ChzzkAccountTab` 미사용 `onUploadDriveSession` prop 제거 (2-1)
8. [x] `tapo_poller.py` — `PollResult` TypedDict 추가, `_upsert_devices` 타입 힌트 보완 (4-2)

### Phase 3 — 중기 (리팩토링)
9. [x] 50줄 초과 함수 3개 분리 (6장)
10. [x] `AiDiscussionTab.tsx` 서브컴포넌트 분리 (6장) — `StatusBar`, `PromptPanel`, `ChatView`, `constants.ts`
11. [x] 백엔드 bare except → `logger.exception()` 전환: `tapo-backend/main.py`, `servercontrol/main.py` (5-2)

### Phase 4 — 장기 (인프라)
12. [x] PostgreSQL 인증 전환 (1-2) — `POSTGRES_PASSWORD` 환경변수 방식으로 전환
13. [x] SSRF 방어 추가 — `proxy.py`에 도메인 화이트리스트 + 내부 IP 차단 (1-3)
14. [x] pydantic 버전 통일 → 전체 `2.9.2` (7-2)
15. [x] docker-compose: ai-discussion DB 호스트 `db`로 통일 + rog-ctrl-backend networks 추가 (7-3, 7-4)

---

## 변경 이력

| 날짜 | 항목 | 내용 |
|------|------|------|
| 2026-03-24 | 초안 작성 | 전체 프로젝트 리뷰 완료, 수정 계획 수립 |
| 2026-03-25 | Phase 1~4 수정 | 13/15항목 완료. 50줄 초과 함수 분리(9), AiDiscussionTab 분리(10)는 별도 세션으로 이관. PostgreSQL 인증(12)은 보류 |
| 2026-03-25 | Phase 3 + 에러처리 | 50줄 초과 함수 분리(9), AiDiscussionTab 분리(10), 프론트 에러 삼킴(5-1) 완료. PostgreSQL 인증(12)만 보류 |
