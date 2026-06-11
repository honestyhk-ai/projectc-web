-- ============================================================================
-- 보안 하드닝: anon(공개 키) 과도 노출 차단
--
-- 배경: 이 Supabase 프로젝트는 anon 역할에게
--   (1) game/game_player/player_ip 에 대한 SELECT 정책(USING true) — 누구나 읽기 가능
--   (2) 위 5개 테이블에 INSERT/UPDATE/DELETE/TRUNCATE GRANT — RLS가 막고 있으나 위험
-- 가 부여돼 있었음. anon 키는 배포된 .exe 에 박혀 있어 사실상 공개됨.
-- → 현재 누구나 게임데이터 147k행 + 플레이어 IP 33k행을 읽을 수 있는 상태.
--
-- 데스크톱 앱은 데이터 접근을 'postgres' 슈퍼유저(직접 psycopg2)로 하므로
-- RLS/정책/grant 변경의 영향을 받지 않음(슈퍼유저는 RLS 우회). 따라서 아래는 안전.
-- 단, 혹시 anon REST 로 이 테이블들을 읽는 다른 소비자가 있다면 영향받을 수 있음.
-- ============================================================================

-- 1) anon 읽기 정책 제거 (로그인 사용자만 읽도록) ---------------------------
drop policy if exists "anon_select_player_ip"     on public.player_ip;      -- IP: 최우선 차단
drop policy if exists "anon_select_game"          on public.game;
drop policy if exists "anon_select_game_player"   on public.game_player;

-- 2) anon 의 쓰기/파괴 권한 회수 (앱은 슈퍼유저로 쓰므로 무관) ----------------
revoke insert, update, delete, truncate, references, trigger
  on public.game, public.game_player, public.player_ip,
     public.player_winrate_summary, public.suspect_pairs
  from anon;
-- authenticated 도 쓰기 불필요(웹은 읽기 전용)하면 함께 회수:
revoke insert, update, delete, truncate, references, trigger
  on public.game, public.game_player, public.player_ip,
     public.player_winrate_summary, public.suspect_pairs
  from authenticated;

-- 3) (선택) archive_*, poll_log 의 anon 읽기도 점검 대상 ----------------------
-- 데스크톱 앱이 anon REST 로 쓰는지 확인 후 결정. 기본은 건드리지 않음.
-- drop policy if exists "anon_select_archive_ip_hint"  on public.archive_ip_hint;
-- drop policy if exists "anon_select_archive_nickname" on public.archive_nickname;
-- drop policy if exists "anon_select_poll_log"         on public.poll_log;
