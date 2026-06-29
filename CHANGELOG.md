# CHANGELOG — 공시인사이트 QA 수정 세션

> 작성 기준: 2026-06-29  
> 대상 브랜치: main (배포 전 검토용)  
> 수정 범위: 백엔드 AI 분析 파이프라인 + 프론트엔드 race condition + 인프라 운영 절차

---

## 수정한 파일 목록

| 경로 | 줄 수 | 수정 분류 |
|---|---|---|
| `backend/src/services/ai/notesEmbedding.service.ts` | 951줄 | 버그 수정 + 로그 정리 |
| `backend/src/jobs/notesEmbedRetry.job.ts` | 46줄 | 안정성 보강 |
| `src/components/disclosure/DisclosureSummarySheet.tsx` | 1838줄 | race condition 수정 |
| `src/services/apiClient.ts` | 139줄 | signal 지원 추가 |
| `backend/src/services/ai/receiptAnalysis.service.ts` | 1040줄 | 상태 관리 전면 개선 |
| `ops_queries.sql` | — | 운영 SQL 신규 작성 |

---

## 수정 목적

**핵심 목표: "됐다가 안 됐다가" 하는 불안정한 문제를 임시방편이 아닌 구조적으로 해결**

1. 기존 공시 주석 검색이 "분析은 된 것 같은데 결과가 안 나오는" 문제 제거
2. AI 분析 실패 시 partial 결과가 완성본처럼 노출되는 문제 제거
3. 공시를 빠르게 전환할 때 이전 공시 데이터가 새 공시 화면에 노출되는 문제 제거
4. API 요청 취소(AbortController)가 실제 네트워크 레벨에서 작동하지 않던 문제 수정

---

## 해결한 버그

### BUG-01: ghost-done — status=done인데 실제 임베딩이 없는 공시
- **위치**: `notesEmbedding.service.ts` `embedAndStoreNotes()`
- **원인**: `status=done`이면 `disclosure_notes_vec`에 실제 데이터가 있는지 확인 없이 스킵. pre-split 임베딩 전체 삭제 후 발생.
- **증상**: 기존 분析된 사업보고서의 주석 검색이 아무 결과도 반환하지 않음.
- **수정**: `alreadyDone > 0` 조건 추가. done이어도 실제 벡터 행이 0개면 재임베딩 진행.

### BUG-02: retryFailedEmbeddings가 ghost-done을 탐지하지 못함
- **위치**: `notesEmbedding.service.ts` `retryFailedEmbeddings()`
- **원인**: `WHERE status IN ('failed','partial','pending')`만 처리 — `done`인데 임베딩 없는 공시는 재시도 대상에서 영구 제외.
- **수정**: `ghost-done` 쿼리 추가 (`status='done' AND NOT EXISTS (SELECT 1 FROM disclosure_notes_vec)`). 개별 공시 실패 시 다른 공시 처리를 막지 않도록 내부 try/catch 추가.

### BUG-03: AbortController가 실제로 요청을 취소하지 못함
- **위치**: `apiClient.ts` + `DisclosureSummarySheet.tsx`
- **원인**: `apiClient.get/post`에 `signal` 파라미터가 없어 `fetch()`에 전달되지 않음. `abort()` 호출해도 네트워크 요청이 계속 진행됨.
- **수정**: `ApiRequestOptions { signal?: AbortSignal }` 타입 추가. `get/post/patch/delete/getRaw` 전체에 signal 파라미터 추가.

### BUG-04: 공시 전환 시 이전 공시 데이터가 새 화면에 노출
- **위치**: `DisclosureSummarySheet.tsx`
- **원인**: ① AbortController 없어 이전 요청 취소 불가 ② `.then()` 콜백에 receiptNo 검증 없음 ③ `loading` state 단일 전역 — 공시 A 분析 중 B로 이동해도 B의 버튼이 막힘.
- **수정**: 3겹 방어 구조 도입 (레이어 1: abort, 레이어 2: 상태 초기화, 레이어 3: receiptNo 검증). `loadingReceiptNoRef`로 어느 공시의 분析인지 추적.

### BUG-05: AI 분析 실패 시 ai_status='failed' 미기록
- **위치**: `receiptAnalysis.service.ts`
- **원인**: Claude 호출 실패(`ai=null`) 시 DB에 아무것도 기록하지 않음. 다음 호출도 동일하게 실패 반복. fallback 결과가 Redis에 7일 캐시됨.
- **수정**: 실패 시 `ai_status='failed'` 명시적 저장. fallback/failed 결과는 Redis 캐시하지 않음.

### BUG-06: ai_summary 존재만으로 완성된 분析으로 판단
- **위치**: `receiptAnalysis.service.ts`
- **원인**: `ai_status='failed'`이거나 summary가 공시 제목과 동일한 fallback 결과도 완성본으로 재사용.
- **수정**: `isCompleteDbAnalysis()` 함수 — status 체크 + summary 10자 이상 + report_name과 다름 3가지 조건 모두 통과해야 재사용.

### BUG-07: 임베딩이 분析 성공 여부와 무관하게 항상 호출됨
- **위치**: `receiptAnalysis.service.ts`
- **원인**: 분析 실패해도 `embedAndStoreNotes()` 항상 호출.
- **수정**: `isValidAiResult()` 통과 + `dbSaved=true` 이후에만 호출.

### BUG-08: preAnalyzeDisclosure가 partial 결과를 완성으로 스킵
- **위치**: `receiptAnalysis.service.ts` `preAnalyzeDisclosure()`
- **원인**: `ai_summary` 존재만으로 스킵 — `analyzeByReceiptNo`의 강화된 기준과 불일치.
- **수정**: `isCompleteDbAnalysis()` 기준으로 통일.

### BUG-09: ai_status 컬럼이 SELECT에 없어 status 체크 무력화
- **위치**: `receiptAnalysis.service.ts`
- **원인**: `isCompleteDbAnalysis`에서 `row.ai_status`를 읽지만 SELECT 목록에 `ai_status`가 없어 항상 `undefined`.
- **수정**: SELECT에 `ai_status` 추가. `DisclosureRow` 타입에 `ai_status?: string | null` 선언. 컬럼 없는 구버전 DB에서는 에러 감지 후 ai_status 제외하고 재조회(graceful fallback).

---

## 변경한 로직

### notesEmbedding.service.ts

```
embedAndStoreNotes():
  Before: status=done → 무조건 스킵
  After:  status=done AND alreadyDone > 0 → 스킵
          status=done AND alreadyDone = 0 → 재임베딩 (ghost-done 복구)
          status=done AND 테이블 없음 → embedAndStoreTables만 재실행

retryFailedEmbeddings():
  Before: WHERE status IN ('failed','partial','pending')
  After:  + ghost-done 쿼리: status='done' AND NOT EXISTS(임베딩 행)
          + 개별 공시 실패 시 try/catch로 격리 (다른 공시 처리 계속)

searchNotes():
  Before: console.log('[NotesSearch] 유사도:') 디버그 로그 있음
  After:  제거 (운영 환경 로그 정리)
```

### notesEmbedRetry.job.ts

```
Before: 중복 실행 방지 없음, 에러 시 isRunning 상태 불명확
After:  isRunning 플래그로 이전 실행 중이면 스킵
        finally 블록에서 isRunning = false 보장
        React StrictMode 방어 주석 추가
```

### apiClient.ts

```
Before: get(path), post(path, body) — signal 파라미터 없음
After:  get(path, options?), post(path, body, options?) — ApiRequestOptions { signal? } 추가
        patch, delete, getRaw 동일하게 적용
        기존 호출부: options 파라미터가 옵셔널이므로 Breaking change 없음
```

### DisclosureSummarySheet.tsx

```
상태 초기화:
  Before: useEffect에서 setState 개별 호출
  After:  resetDisclosureState() 단일 함수로 원자적 초기화

Race condition 방지 (3겹):
  레이어 1: AbortController.abort() — 네트워크 레벨 취소
  레이어 2: resetDisclosureState() — 상태 즉시 초기화
  레이어 3: currentReceiptNoRef 비교 — 응답 적용 전 최종 검증

AI 분析 연타 방지:
  Before: loading state 전역 하나 — 공시 A 분析 중 B로 이동하면 B 버튼 막힘
  After:  loadingReceiptNoRef — "어느 공시의 분析인가" 추적
          공시 변경 시 ref 즉시 null 초기화 → B 버튼 정상 동작

로딩 중 이전 데이터 노출 차단:
  capLoading 중: 이전 자본금 변동 데이터 대신 스켈레톤 표시
  reportInfo.loading 중: 이전 재무정보 대신 스켈레톤 표시
```

### receiptAnalysis.service.ts

```
캐시:
  Before: CACHE_PREFIX = 'ai:disclosure:'   (v1)
  After:  CACHE_PREFIX = 'ai:disclosure:v2:' (v2)
  → 기존 v1 키는 TTL(7일) 자연 만료

DB 재사용 판단:
  Before: if (row.ai_summary && row.ai_summary.trim().length > 0)
  After:  if (isCompleteDbAnalysis(row))
          → ai_status='completed' AND summary≥10자 AND summary≠report_name

Claude 결과 검증:
  Before: ai !== null → 바로 completed 저장
  After:  isValidAiResult(ai): summary≥10자 AND detail≥20자 통과 필수
          실패 시 ai_status='failed' 저장 + 캐시 안 함

DB 저장:
  Before: 저장 실패해도 캐시에는 저장
  After:  dbSaved=true일 때만 캐시 (DB↔Redis 불일치 방지)

임베딩 호출:
  Before: 분析 결과와 무관하게 항상 호출
  After:  isValidAiResult 통과 + dbSaved=true 이후에만 호출

ai_status 컬럼 없는 구버전 DB:
  Before: 쿼리 실패 → return null → 모든 분析 API 불능
  After:  에러 감지 → ai_status 제외하고 재조회 → 서비스 유지
```

---

## DB 변경 사항

### 신규 컬럼 (마이그레이션 필요)

```sql
ALTER TABLE disclosures
  ADD COLUMN IF NOT EXISTS ai_status        VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at   TIMESTAMPTZ   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_key_numbers   JSONB         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_timeline      TEXT          DEFAULT NULL;
```

### ai_status 값 정의

| 값 | 의미 |
|---|---|
| `NULL` | 분析 미실행 |
| `'completed'` | 분析 성공 + 필수 필드 완전 |
| `'failed'` | 분析 실패 또는 내용 불충분 |
| `'partial'` | 부분 성공 (향후 확장용) |

### 기존 데이터 백필

```sql
-- 기존 분析 완료 공시에 completed 상태 부여
UPDATE disclosures
SET ai_status = 'completed'
WHERE ai_status IS NULL
  AND ai_summary IS NOT NULL
  AND LENGTH(TRIM(ai_summary)) >= 10
  AND TRIM(ai_summary) != TRIM(COALESCE(report_name,''));
```

---

## Redis 캐시 변경 사항

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 캐시 키 prefix | `ai:disclosure:` | `ai:disclosure:v2:` |
| 기존 v1 키 처리 | — | TTL 7일 후 자연 만료 (삭제 명령 불필요) |
| fallback/failed 캐시 | 캐시함 (7일간 오염) | 캐시하지 않음 |
| 저장 조건 | 항상 | `dbSaved=true`일 때만 |

**롤백 방법**: `CACHE_PREFIX = 'ai:disclosure:'`로 되돌리면 v1 캐시 즉시 복원.

---

## 배포 순서

```
[STEP 0] 현황 파악 (ops_queries.sql STEP 0)
    → ai_status 컬럼 존재 확인
    → 재분析 필요 건수 파악

[STEP 1] 마이그레이션 (ops_queries.sql STEP 1)
    → ALTER TABLE ADD COLUMN IF NOT EXISTS ai_status
    → 기존 정상 분析 공시에 ai_status='completed' 백필

[STEP 2] 코드 배포
    → npx tsc --noEmit 로컬 확인 후 배포
    → CACHE_PREFIX = 'ai:disclosure:v2:' 포함 확인

[STEP 3] 오염 데이터 정리 (ops_queries.sql STEP 3)
    → partial/garbage completed 공시 상태 → 'failed' 리셋

[STEP 4] 임베딩 재등록 (ops_queries.sql STEP 4)
    → completed인데 임베딩 없는 정기보고서 → pending 등록
    → notesEmbedRetry.job이 15분 내 자동 처리

[STEP 5] 모니터링 (배포 24시간 후, ops_queries.sql STEP 5)
    → 분析 성공/실패율 확인
    → 임베딩 현황 확인
    → 재분析 필요 잔여 건수 → 0 수렴 확인
```

---

## 배포 후 확인 체크리스트

### 즉시 확인 (배포 직후)

- [ ] 서버 기동 로그에 `[AI분석] ai_status 컬럼 없음` 경고 없음
  - 있으면 → STEP 1 마이그레이션 미실행, 즉시 실행
- [ ] 공시 상세 화면에서 AI 분析 버튼 정상 동작
- [ ] 공시 A → 공시 B 빠르게 전환 시 B 데이터만 표시됨
- [ ] Chrome Network 탭에서 공시 전환 시 이전 요청 `cancelled` 표시

### 15분 후 확인

- [ ] `notesEmbedRetry.job` 로그: `재처리 N건 시도, M건 복구`
- [ ] `SELECT status, COUNT(*) FROM notes_embed_status GROUP BY status` — pending 감소 확인

### 24시간 후 확인 (ops_queries.sql STEP 5 실행)

- [ ] `ai_status='failed'` 건수 증가 없음 (신규 실패 없음)
- [ ] `ai_status='completed'` 건수 점진 증가 (정상 분析 누적)
- [ ] 임베딩 `status='done'` 건수 증가
- [ ] `재분析_필요_잔여` 건수 감소 추세

### 롤백 기준

아래 중 하나 발생 시 즉시 이전 버전으로 롤백:

- 서버 프로세스가 반복 재시작됨
- `[AI분析] DB 조회 실패(재시도):` 로그가 분당 10건 이상
- AI 분析 성공률이 배포 전 대비 20% 이상 하락

**롤백 시 Redis**: `CACHE_PREFIX`를 `'ai:disclosure:'`로 되돌리면 v1 캐시 즉시 복원.

---

## 코드 레벨에서 확인한 것 vs 실환경 필요한 것

### 코드 레벨 확인 완료

- 모든 수정 패턴 정적 검증 (Python 파싱)
- 기존 호출부 Breaking change 없음 (apiClient signal 옵셔널)
- isCompleteDbAnalysis 경계값 12개 케이스 시뮬레이션
- React StrictMode 구조적 안전성 분석

### 실환경에서만 확인 가능

- `npx tsc --noEmit` TypeScript 에러 없음
- `npm run build` 성공
- Chrome DevTools Network탭 — 공시 전환 시 `cancelled` 표시
- Render 배포 후 콜드 스타트 30초 이내 정상 응답
