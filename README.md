# ProjectC 전적 웹 (개인용)

Chaos Online 데이터(`ProjectC.exe` 가 모아 Supabase 에 저장하는 데이터)를 op.gg 스타일로 보여주는 **개인용** 웹입니다. 로그인한 사용자만 볼 수 있습니다.

## 구조

```
프론트엔드(Vite+React, 정적)  →  Supabase REST(/rest/v1, /rpc)  →  PostgreSQL
        │                              │
   GitHub Pages 호스팅            로그인(Auth) + RLS 로 보호
```

- 웹은 **읽기 전용**. 데이터 수집/쓰기는 기존 `ProjectC.exe`(또는 추후 GitHub Actions cron)가 담당.
- **민감 데이터(player_ip, suspect_pairs)는 노출하지 않습니다.** (RLS 정책 미부여로 차단)

## 사용한 데이터 (ProjectC 분석 결과)

| 테이블 | 용도 |
|--------|------|
| `game` | 경기 메타 (gameID, date, roomType, winnerTeam, averageRating …) |
| `game_player` | 경기별 플레이어 (ano, nickname, campType, heroNo, mvpOdds) |
| `player_winrate_summary` | **사전 집계된 승률** (normal/ranked 게임·승·무) — 프로필 개요에 사용 |
| `player_ip` | (웹 미사용) |
| `suspect_pairs` | (웹 미사용) |

## 셋업

### 1. Supabase 준비
1. Supabase 대시보드 > **SQL Editor** 에서 [`supabase/setup.sql`](supabase/setup.sql) 실행
   (RLS 정책 + 조회용 RPC 함수 생성)
2. **Authentication > Users > Add user** 로 내 계정 1개 생성
3. (선택) **Authentication > Providers** 에서 "Allow new users to sign up" **OFF** → 외부인 가입 차단

### 2. 로컬 실행
```bash
cp .env.example .env      # Windows: copy .env.example .env
# .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 채우기
#   값: Supabase 대시보드 > Project Settings > API
npm install
npm run dev
```
→ http://localhost:5173

### 3. GitHub Pages 배포
1. 이 폴더를 GitHub 저장소로 push (`main` 브랜치)
2. 저장소 **Settings > Secrets and variables > Actions** 에 등록:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings > Pages > Build and deployment > Source = GitHub Actions**
4. push 하면 `.github/workflows/deploy.yml` 가 자동 빌드·배포

## 보안 메모

- 프론트에는 **anon key 만** 사용합니다. `service_role` 키, DB 비밀번호는 절대 넣지 마세요.
- anon key 가 공개돼도 안전한 이유 = **RLS + 로그인 게이트**. `setup.sql` 의 정책이 켜져 있어야 합니다.
- ⚠️ `ProjectC.exe` 에 하드코딩되어 이미 노출된 **DB 비밀번호와 GitHub PAT 는 폐기/재발급**하세요. (이 웹 작업과 별개)

## 데이터 자동 갱신 (구현됨)

`.github/workflows/sync.yml` 가 **30분마다** `scripts/sync.mjs` 를 실행해 원본 프로젝트(wqlav)의 새 데이터를 이 프로젝트(lcmql)로 증분 동기화합니다.

- game/game_player: gameID 워터마크로 증분 append (멱등)
- player_ip / player_winrate_summary / suspect_pairs: 전체 갱신(작은 파생 테이블)
- 필요한 Actions 시크릿: `WQLAV_DB_URL`, `LCMQL_DB_URL` (둘 다 postgres 접속 URI)
- ⚠️ **의존성:** 원본 수집기(ProjectC.exe 제작자)가 wqlav 를 계속 갱신하고 wqlav DB 접속정보가 유효해야 동작. 끊기면 lcmql 도 갱신 중단(기존 데이터는 유지).

## 다음 단계 (선택)

- 영웅 번호 → 영웅 이름 매핑 테이블 추가
- roomType 라벨 정확화 (`src/lib/types.ts` 의 `GAME_TYPE_LABELS`)
