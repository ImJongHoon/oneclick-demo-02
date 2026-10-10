# OneClick compose demo

OneClick의 DB 배포 시연용 앱입니다. 방문할 때마다 Postgres에 기록하고 총 방문 수를 보여 줍니다.

- `main`에는 일부러 `Dockerfile`과 `compose.yaml`이 없습니다. OneClick이 `package.json`의 `pg` 의존성을 보고 Postgres가 필요한 앱임을 알아내, compose 파일은 템플릿으로, Dockerfile은 AI로 만들어 설정 PR에 넣습니다.
- DB 비밀번호는 OneClick이 만들어 암호화된 환경변수에 저장합니다. 저장소에는 들어가지 않습니다.
- 재배포·롤백해도 방문 수가 이어지면 "데이터 보존 + 무중단 교체"가 동작하는 것입니다.
- 테이블은 앱이 시작할 때 직접 만듭니다 (`CREATE TABLE IF NOT EXISTS`).
- 응답 헤더 `X-App-Version`에 버전을 넣습니다 (OneClick 측정 스크립트가 읽음).

## 시나리오 브랜치

설정 PR을 `main`에 머지한 뒤 `sync-branches.mjs`를 한 번 실행해야 각 브랜치가 워크플로·compose를 갖고 빌드됩니다.

| 브랜치 | 바뀐 것 | 화면 |
|--------|--------|------|
| `main` | — | 파랑 v1 |
| `v2` | 버전·색 | 초록 v2 |
| `with-redis` | compose에 Redis 추가 | 보라 v3, 캐시 "연결됨" |
| `needs-env` | compose에 `API_KEY` 필요 | 주황 v4, API_KEY "설정됨" |
| `crash-on-start` | 시작하자마자 종료 | (배포 실패, 기존 버전 유지) |
| `broken-build` | 없는 파일을 COPY하는 Dockerfile | (GitHub Actions 빌드 실패) |
| `load` | "부하 주기" 버튼 (20초 동안 CPU 코어마다 계산 + 메모리 300MB) | 빨강 v5, 서버 화면의 CPU 그래프가 치솟음 |
