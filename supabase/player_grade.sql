-- ============================================================================
-- 공식 현재 등급(player_grade) — 게임 내 '내 정보'와 동일한 등급/점수/순위.
--   적재: scripts/grades.mjs (.github/workflows/grades.yml, 하루 1회).
--     랭크 참가자(player_winrate_summary.ranked_games>0) ano 를 공식
--     GetHallOfFameHistory 로 조회 → 시즌 Top200 진입자만 행이 생김(그 밖은 비공개).
--   로그인 게이트 유지: anon 차단, authenticated 만 RPC 실행.
--   ※ 이 파일은 문서용. 실제 운영 적용은 grades.mjs 가 멱등 자동 프로비저닝.
-- ============================================================================

create table if not exists public.player_grade (
  ano           text primary key,
  season_year   int,
  season_no     int,
  grade         int,             -- 등급 아이콘 번호 0~20 (0=다이아, 1~5루비, 6~10자수정, 11~15사파이어, 16~20에메랄드)
  grade_name    text default '', -- 예: '루비 1', '에메랄드 5', '다이아몬드'
  point         int,             -- 점수 (다이아몬드는 보통 0)
  official_rank int,             -- 현재(일별) 공식 순위 1~200
  wins int, losses int, draws int, games int,
  winrate       numeric,
  contribution  numeric,         -- 평균 기여도 (ContributeCentuple/100)
  snapshot_date date,
  updated_at    timestamptz default now()
);

alter table public.player_grade enable row level security;  -- 직접 노출 차단(정책 없음)

-- 특정 계정의 공식 현재 등급 1행 (프로필 '공식 랭킹' 카드용).
create or replace function public.official_grade(p_ano text)
returns setof public.player_grade
language sql
stable
security definer
set search_path = public
as $$
  select * from public.player_grade where ano = p_ano limit 1;
$$;

-- SECURITY DEFINER 함수는 생성 시 PUBLIC 에 실행권한 기본 부여 → 반드시 revoke.
revoke execute on function public.official_grade(text) from public, anon;
grant  execute on function public.official_grade(text) to authenticated;
