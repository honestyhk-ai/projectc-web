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

-- 플레이어 검색: 닉네임/과거닉 부분일치 또는 ano 정확일치.
--   ⚠️ 과거: game_player(100만행)⋈game 풀스캔 + 선행 와일드카드 ilike → statement timeout 빈발.
--   현재: 계정당 1행 player_summary + pg_trgm GIN 인덱스로 교체(빠름). player_summary 는
--   RLS on·정책 없음(민감정보 포함)이라 security definer 로 조회 → public/anon revoke 필수.
--   실제 운영 적용은 scripts/sync.mjs 의 ensureSearchInfra 가 멱등 자동 프로비저닝(수동 SQL 불필요).
create extension if not exists pg_trgm;
create index if not exists idx_ps_nick_trgm   on public.player_summary using gin (nickname gin_trgm_ops);
create index if not exists idx_ps_search_trgm on public.player_summary using gin (search_nicknames gin_trgm_ops);

create or replace function public.search_players(q text)
returns table(ano text, nickname text)
language sql stable security definer set search_path = public, pg_temp as $$
  select ps.ano, coalesce(ps.nickname, '') as nickname
  from public.player_summary ps
  where char_length(btrim(q)) >= 1 and (
        ps.nickname ilike '%' || q || '%'
     or ps.search_nicknames ilike '%' || q || '%'
     or lower(ps.ano) = lower(btrim(q)))
  order by ps.game_count desc nulls last
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
-- search_players 는 security definer → public 까지 회수(definer 함수는 public 에 기본 부여됨).
revoke execute on function public.search_players(text)        from public, anon;
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
-- 4c) 부계정 의심쌍 + IP 검색 (로그인 사용자 전용)
-- ============================================================================
grant select on public.suspect_pairs to authenticated;
drop policy if exists "auth read susp" on public.suspect_pairs;
create policy "auth read susp" on public.suspect_pairs for select to authenticated using (true);

-- 특정 계정과 의심되는 부계정 쌍 (identity_score 순; 저장 임계 0.65)
create or replace function public.player_suspects(p_ano text)
returns table(other_ano text, other_nick text, identity_score real, shared_ip_count integer,
              game_count_other bigint, timing_overlap boolean, concurrent_ratio real,
              signal_details jsonb)
language sql stable as $$
  select case when ano_a = p_ano then ano_b else ano_a end,
         case when ano_a = p_ano then nick_b else nick_a end,
         identity_score, shared_ip_count,
         case when ano_a = p_ano then game_count_b else game_count_a end,
         timing_overlap, concurrent_ratio, signal_details
  from suspect_pairs
  where ano_a = p_ano or ano_b = p_ano
  order by identity_score desc limit 100;
$$;

-- IP 프리픽스로 계정 검색
create or replace function public.accounts_by_ip(p_ip text)
returns table(ip text, ano text, nickname text, game_count bigint, ip_total bigint)
language sql stable as $$
  with matched_ips as (select distinct ip from player_ip where ip like p_ip || '%'),
  linked as (select pi.ano, pi.ip from player_ip pi where pi.ip in (select ip from matched_ips)),
  nicks as (
    select distinct on (gp.ano) gp.ano, gp.nickname
    from game_player gp join game g on g."gameID" = gp."gameID"
    where gp.nickname <> '' and gp.ano in (select ano from linked)
    order by gp.ano, g.date desc),
  gcounts as (
    select gp.ano, gp.ip, count(distinct gp."gameID") as cnt from game_player gp
    where gp.ano in (select ano from linked) and gp.ip in (select ip from matched_ips)
    group by gp.ano, gp.ip),
  ip_totals as (
    select gp.ip, count(distinct gp."gameID") as total from game_player gp
    where gp.ip in (select ip from matched_ips) group by gp.ip)
  select l.ip, l.ano, coalesce(n.nickname,'') as nickname,
         coalesce(gc.cnt,0) as game_count, coalesce(it.total,0) as ip_total
  from linked l
  left join nicks n on n.ano = l.ano
  left join gcounts gc on gc.ano = l.ano and gc.ip = l.ip
  left join ip_totals it on it.ip = l.ip
  order by l.ip, game_count desc limit 500;
$$;

revoke execute on function public.player_suspects(text), public.accounts_by_ip(text) from anon;
grant  execute on function public.player_suspects(text), public.accounts_by_ip(text) to authenticated;

-- ============================================================================
-- 4d) 순위 (랭크 실측 통계 기준; 정렬 wins|winrate|games, 전체 참가자)
--   닉네임 빠른 조회용으로 player_summary(원본에서 sync) 를 조인. player_summary 는
--   IP 등 민감정보 포함이라 직접 노출 금지(RLS on, 정책 없음) → ranking 은 SECURITY DEFINER.
-- ============================================================================
alter table public.player_summary enable row level security;  -- 직접 노출 차단(정책 없음)

create or replace function public.ranking(p_sort text default 'wins')
returns table(rnk bigint, ano text, nickname text, games int, wins int, losses int, draws int, winrate numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select w.ano, w.ranked_games games, w.ranked_wins wins, w.ranked_draws draws,
           greatest(w.ranked_games-w.ranked_wins-w.ranked_draws,0) losses,
           round(100.0*w.ranked_wins/nullif(w.ranked_games,0),1) winrate
    from player_winrate_summary w where w.ranked_games > 0
  )
  select row_number() over (order by
            case when p_sort='games'   then b.games end desc nulls last,
            case when p_sort='winrate' then (b.wins::numeric/nullif(b.games,0)) end desc nulls last,
            case when p_sort='wins'    then b.wins end desc nulls last,
            b.wins desc, b.games desc) as rnk,
         b.ano, coalesce(ps.nickname,'') as nickname, b.games, b.wins, b.losses, b.draws, b.winrate
  from base b left join player_summary ps on ps.ano = b.ano
  order by rnk;
$$;
-- SECURITY DEFINER 함수는 생성 시 PUBLIC 에 실행권한이 기본 부여됨 → 반드시 public 까지 revoke.
revoke execute on function public.ranking(text) from public, anon;
grant  execute on function public.ranking(text) to authenticated;

-- ============================================================================
-- 4e) 프로필 상세 (주력 영웅 + 개요)
-- ============================================================================
-- 영웅별 게임수·승패·승률 (영웅 이름 매핑은 없어 heroNo + 초상화로 표시)
create or replace function public.player_heroes(p_ano text)
returns table(hero_no text, games bigint, wins bigint, losses bigint, draws bigint, winrate numeric)
language sql stable as $$
  with g2 as (
    select gp."heroNo" hn, g."winnerTeam" wt, gp."campType" ct
    from game_player gp join game g on gp."gameID"=g."gameID"
    where gp.ano=p_ano and gp."heroNo"<>''
  )
  select hn, count(*) games,
    count(*) filter (where wt in ('E','U') and ((ct='0' and wt='E') or (ct='1' and wt='U'))) wins,
    count(*) filter (where wt in ('E','U') and not ((ct='0' and wt='E') or (ct='1' and wt='U'))) losses,
    count(*) filter (where wt not in ('E','U')) draws,
    round(100.0*count(*) filter (where wt in ('E','U') and ((ct='0' and wt='E') or (ct='1' and wt='U')))
          / nullif(count(*) filter (where wt in ('E','U')),0),1) winrate
  from g2 group by hn order by games desc;
$$;

-- 개요: 첫/마지막 게임, 사용 IP 수, 전체 게임 수, 평균 MVP 지수(mvpOdds)
-- (KDA/기여도/디스펠은 ObserveGame API 가 제공하지 않아 데이터에 없음. mvpOdds 만 존재)
drop function if exists public.player_overview(text);
create function public.player_overview(p_ano text)
returns table(first_seen text, last_seen text, ip_count int, total_games bigint, avg_mvp numeric)
language sql stable as $$
  select min(g.date), max(g.date),
    (select count(distinct ip)::int from player_ip where ano=p_ano and ip<>''),
    count(distinct gp."gameID"),
    round(avg((gp."mvpOdds")::numeric) filter (where gp."mvpOdds" ~ '^[0-9.]+$' and gp."mvpOdds"<>''), 2)
  from game_player gp join game g on gp."gameID"=g."gameID" where gp.ano=p_ano;
$$;

revoke execute on function public.player_heroes(text), public.player_overview(text) from public, anon;
grant  execute on function public.player_heroes(text), public.player_overview(text) to authenticated;

-- ============================================================================
-- 5) 내 계정 1개 만들기 (개인용)
--    Supabase 대시보드 > Authentication > Users > "Add user" 로 직접 생성하거나,
--    Authentication > Providers > Email 에서 "Confirm email" 끈 뒤 앱에서 가입.
--    공개 사이트이므로 신규 가입을 막으려면:
--      Authentication > Sign In / Providers 에서 "Allow new users to sign up" OFF.
-- ============================================================================
