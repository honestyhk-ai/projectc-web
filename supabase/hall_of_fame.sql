-- ============================================================================
-- 명예의 전당(공식 HallOfFame.aspx 상위 100) 테이블 + 조회 RPC
--   데이터 적재: scripts/hof.mjs (GitHub Actions sync 워크플로). data-ano 로 우리 DB 매칭.
--   로그인 게이트 유지: anon 차단, authenticated 만 RPC 실행 가능.
-- ============================================================================

create table if not exists public.hall_of_fame (
  season_year   int  not null,
  season_no     int  not null,
  rank          int  not null,
  ano           text not null,
  nickname      text default '',
  grade_icon    int,
  grade_text    text default '',     -- 예: '다이아몬드', '자수정 4', '루비 5'
  season_change text default '',     -- 시즌 순위 변동 (▲8 / ▼2 / NEW / -)
  daily_change  text default '',
  winrate       numeric,
  kda           numeric,
  games         int,
  contribution  numeric,
  hero1 text default '', hero1_name text default '',
  hero2 text default '', hero2_name text default '',
  point           int,                 -- 현재 점수 (게임 내 '내 정보'와 동일, 일별 스냅샷)
  live_grade      int,                 -- 현재 세부 등급 아이콘 번호 0~20
  live_grade_name text default '',     -- 예: '사파이어 5'
  live_rank       int,                 -- 현재(일별) 순위
  snapshot_date   date,                -- 스냅샷 기준일
  updated_at    timestamptz default now(),
  primary key (season_year, season_no, ano)
);

create index if not exists idx_hall_of_fame_rank on public.hall_of_fame (season_year desc, season_no desc, rank);
create index if not exists idx_hall_of_fame_ano  on public.hall_of_fame (ano, season_year desc, season_no desc);

alter table public.hall_of_fame enable row level security;  -- 직접 노출 차단(정책 없음)

-- 최신 시즌 명예의 전당을 순위순으로 반환.
create or replace function public.hall_of_fame_current()
returns setof public.hall_of_fame
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.hall_of_fame
  where (season_year, season_no) = (
    select season_year, season_no
    from public.hall_of_fame
    order by season_year desc, season_no desc
    limit 1
  )
  order by rank;
$$;

-- 특정 계정의 최신 시즌 명예의 전당 1행 (프로필 '공식 랭킹' 카드용).
create or replace function public.hall_of_fame_player(p_ano text)
returns setof public.hall_of_fame
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.hall_of_fame
  where ano = p_ano
  order by season_year desc, season_no desc
  limit 1;
$$;

-- SECURITY DEFINER 함수는 생성 시 PUBLIC 에 실행권한 기본 부여 → 반드시 revoke.
revoke execute on function public.hall_of_fame_current() from public, anon;
revoke execute on function public.hall_of_fame_player(text) from public, anon;
grant  execute on function public.hall_of_fame_current() to authenticated;
grant  execute on function public.hall_of_fame_player(text) to authenticated;
