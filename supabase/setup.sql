-- ============================================================================
-- ProjectC 전적 웹 — Supabase 설정
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행.
--
-- 전제: ProjectC 데스크톱 앱이 이미 아래 테이블을 채우고 있음
--   game, game_player, player_ip, player_winrate_summary, suspect_pairs
--
-- 정책 방향: "로그인한 사용자만 읽기 가능" (개인용 게이트).
--   - anon(비로그인) 역할: 접근 불가
--   - authenticated(로그인) 역할: 읽기 전용(SELECT) 허용
--   - 쓰기는 데스크톱 앱(DB 직접 접속 / service_role)이 담당하므로 웹에는 권한 없음
-- ============================================================================

-- 1) RLS 켜기 ----------------------------------------------------------------
alter table public.game                   enable row level security;
alter table public.game_player            enable row level security;
alter table public.player_winrate_summary enable row level security;
-- player_ip, suspect_pairs 는 민감(IP/부계정 단정) → 웹 노출 안 함.
-- RLS만 켜고 정책을 만들지 않으면 authenticated 도 못 읽음(안전한 기본값).
alter table public.player_ip              enable row level security;
alter table public.suspect_pairs          enable row level security;

-- 2) 읽기 정책 (로그인 사용자 전용) ------------------------------------------
drop policy if exists "auth read game"    on public.game;
create policy "auth read game"    on public.game
  for select to authenticated using (true);

drop policy if exists "auth read gp"      on public.game_player;
create policy "auth read gp"      on public.game_player
  for select to authenticated using (true);

drop policy if exists "auth read wr"      on public.player_winrate_summary;
create policy "auth read wr"      on public.player_winrate_summary
  for select to authenticated using (true);

-- 3) 조회용 RPC 함수 (조인이 필요한 것만) ------------------------------------
-- security invoker(기본) → 호출자(authenticated)의 RLS 권한으로 동작.

-- 플레이어 검색: 닉네임 부분일치 또는 ano 정확일치 → 계정별 최신 닉 1건
create or replace function public.search_players(q text)
returns table(ano text, nickname text)
language sql stable as $$
  select distinct on (gp.ano) gp.ano, gp.nickname
  from game_player gp
  join game g on gp."gameID" = g."gameID"
  where gp.nickname <> ''
    and (gp.nickname ilike '%' || q || '%' or lower(gp.ano) = lower(q))
  order by gp.ano, g.date desc
  limit 50;
$$;

-- 최근 경기 목록 (승패 판정 포함)
-- 승패 매핑(실측으로 확정): campType '0' 은 winnerTeam 'E', '1' 은 'U' 일 때 승.
--   is_win = true(승) / false(패) / null(무·노리절트: winnerTeam '' 또는 'N')
create or replace function public.player_recent_games(p_ano text, p_limit int default 30)
returns table(
  "gameID" text, date text, "roomType" text, "averageRating" text,
  "heroNo" text, "campType" text, "mvpOdds" text,
  "winnerTeam" text, "gameTime" text, "liveType" text, is_win boolean
)
language sql stable as $$
  select g."gameID", g.date, g."roomType", g."averageRating",
         gp."heroNo", gp."campType", gp."mvpOdds",
         g."winnerTeam", g."gameTime", g."liveType",
         case
           when g."winnerTeam" in ('', 'N') then null
           when (gp."campType" = '0' and g."winnerTeam" = 'E')
             or (gp."campType" = '1' and g."winnerTeam" = 'U') then true
           else false
         end as is_win
  from game_player gp
  join game g on gp."gameID" = g."gameID"
  where gp.ano = p_ano
  order by g.date desc
  limit coalesce(p_limit, 30);
$$;

-- 닉네임 변경 이력
create or replace function public.player_nick_history(p_ano text)
returns table(nickname text, first_seen text, last_seen text, games bigint)
language sql stable as $$
  select gp.nickname,
         min(g.date) as first_seen,
         max(g.date) as last_seen,
         count(distinct gp."gameID") as games
  from game_player gp
  join game g on gp."gameID" = g."gameID"
  where gp.ano = p_ano and gp.nickname <> ''
  group by gp.nickname
  order by first_seen;
$$;

-- 4) 실행 권한: 로그인 사용자에게만, anon 에게서는 회수 -----------------------
revoke execute on function public.search_players(text)        from anon;
revoke execute on function public.player_recent_games(text,int) from anon;
revoke execute on function public.player_nick_history(text)    from anon;
grant  execute on function public.search_players(text)        to authenticated;
grant  execute on function public.player_recent_games(text,int) to authenticated;
grant  execute on function public.player_nick_history(text)    to authenticated;

-- ============================================================================
-- 4b) IP 기능 (로그인 사용자 전용 — 절대 공개 금지)
--   저장된 ip 는 앞 2옥텟 프리픽스(원본 수집기가 부분 익명화). 공유 IP = 부계정 신호.
-- ============================================================================
grant select on public.player_ip to authenticated;
drop policy if exists "auth read pip" on public.player_ip;
create policy "auth read pip" on public.player_ip for select to authenticated using (true);

-- 플레이어가 사용한 IP 목록
create or replace function public.player_ips(p_ano text)
returns table(ip text, first_seen text, last_seen text, game_count bigint)
language sql stable as $$
  select gp.ip, min(g.date) as first_seen, max(g.date) as last_seen,
         count(distinct gp."gameID") as game_count
  from game_player gp join game g on gp."gameID" = g."gameID"
  where gp.ano = p_ano and gp.ip <> ''
  group by gp.ip order by first_seen;
$$;

-- 같은 IP를 공유하는 계정들 (IP별)
create or replace function public.ip_shared_accounts(p_ano text)
returns table(ip text, ano text, nickname text, game_count bigint)
language sql stable as $$
  with ips as (select ip from player_ip where ano = p_ano),
  all_accounts as (select distinct pi.ano, pi.ip from player_ip pi where pi.ip in (select ip from ips)),
  nicks as (
    select distinct on (gp.ano) gp.ano, gp.nickname
    from game_player gp join game g on g."gameID" = gp."gameID"
    where gp.nickname <> '' and gp.ano in (select ano from all_accounts)
    order by gp.ano, g.date desc),
  gcounts as (
    select gp.ano, gp.ip, count(distinct gp."gameID") as cnt
    from game_player gp
    where gp.ano in (select ano from all_accounts) and gp.ip in (select ip from ips)
    group by gp.ano, gp.ip)
  select a.ip, a.ano, coalesce(n.nickname, '') as nickname, coalesce(gc.cnt, 0) as game_count
  from all_accounts a
  left join nicks n on n.ano = a.ano
  left join gcounts gc on gc.ano = a.ano and gc.ip = a.ip
  order by a.ip, game_count desc;
$$;

revoke execute on function public.player_ips(text), public.ip_shared_accounts(text) from anon;
grant  execute on function public.player_ips(text), public.ip_shared_accounts(text) to authenticated;

-- ============================================================================
-- 5) 내 계정 1개 만들기 (개인용)
--    Supabase 대시보드 > Authentication > Users > "Add user" 로 직접 생성하거나,
--    Authentication > Providers > Email 에서 "Confirm email" 끈 뒤 앱에서 가입.
--    공개 사이트이므로 신규 가입을 막으려면:
--      Authentication > Sign In / Providers 에서 "Allow new users to sign up" OFF.
-- ============================================================================
