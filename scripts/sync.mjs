// wqlav(원본) -> lcmql(내 프로젝트) 증분 동기화.
// game/game_player 는 gameID 워터마크로 증분 append, 파생 테이블은 전체 갱신.
// env: WQLAV_DB_URL, LCMQL_DB_URL (둘 다 postgres 접속 URI)
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { to as copyTo, from as copyFrom } from "pg-copy-streams";

const SRC = (process.env.WQLAV_DB_URL || "").split("?")[0];
const DST = (process.env.LCMQL_DB_URL || "").split("?")[0];
if (!SRC || !DST) { console.error("WQLAV_DB_URL / LCMQL_DB_URL 미설정"); process.exit(1); }

const src = new pg.Client({ connectionString: SRC, ssl: { rejectUnauthorized: false } });
const dst = new pg.Client({ connectionString: DST, ssl: { rejectUnauthorized: false } });

const t0 = Date.now();

// player_summary(계정당 1행) 기반 빠른 검색 함수 + 트라이그램 인덱스를 멱등 적용.
// player_summary 는 RLS on·정책 없음 → security definer 로 조회(ranking 과 동일 패턴).
async function ensureSearchInfra(dst) {
  const hasCol = async (table, col) =>
    (await dst.query(
      `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
      [table, col],
    )).rowCount > 0;

  // search_nicknames 는 text[] 배열이라 trgm 인덱스 불가 → 부분일치는 unnest 로. (player_summary 는 약 2만행이라 빠름)
  const colType = async (table, col) =>
    (await dst.query(
      `select data_type from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
      [table, col],
    )).rows[0]?.data_type ?? null;

  await dst.query(`create extension if not exists pg_trgm`);
  // 현재닉(text)에만 트라이그램 인덱스 — 선행 와일드카드 ilike 가속.
  await dst.query(
    `create index if not exists idx_ps_nick_trgm on public.player_summary using gin (nickname gin_trgm_ops)`,
  );
  const searchType = await colType("player_summary", "search_nicknames");
  const hasGameCount = await hasCol("player_summary", "game_count");
  const searchPred =
    searchType === "ARRAY"
      ? `or exists (select 1 from unnest(ps.search_nicknames) sn where sn ilike '%'||q||'%')`
      : searchType
        ? `or ps.search_nicknames ilike '%'||q||'%'`
        : "";
  const orderBy = hasGameCount ? "order by ps.game_count desc nulls last" : "";

  await dst.query(`
    create or replace function public.search_players(q text)
    returns table(ano text, nickname text)
    language sql stable security definer set search_path = public, pg_temp as $fn$
      select ps.ano, coalesce(ps.nickname,'') as nickname
      from public.player_summary ps
      where char_length(btrim(q)) >= 1 and (
            ps.nickname ilike '%'||q||'%'
            ${searchPred}
         or lower(ps.ano) = lower(btrim(q)))
      ${orderBy}
      limit 50
    $fn$`);
  await dst.query(`revoke execute on function public.search_players(text) from public, anon`);
  await dst.query(`grant execute on function public.search_players(text) to authenticated`);
  console.log(`  [search] player_summary 기반 search_players 적용 (과거닉 ${searchType === "ARRAY" ? "unnest" : searchType || "없음"})`);

  // IP 분석 RPC 타임아웃 수정 -----------------------------------------------
  //  - player_ips: 단일 계정 game_player 스캔 → game_player(ano) 인덱스로 가속.
  //  - ip_shared_accounts: 기존엔 game_player(108만행)를 nicks·gcounts 로 반복 스캔해 statement timeout 발생.
  //    → game_player 를 버리고 player_ip(3.3만)+player_summary(2만) 만으로 재작성(security definer).
  //    game_count 는 계정 총게임수(player_summary.game_count) 로 대체(IP별 카운트 대신 — 속도 우선).
  await dst.query(`create index if not exists idx_gp_ano on public.game_player(ano)`);
  await dst.query(`
    create or replace function public.ip_shared_accounts(p_ano text)
    returns table(ip text, ano text, nickname text, game_count bigint)
    language sql stable security definer set search_path = public, pg_temp as $fn$
      with ips as (select ip from public.player_ip where ano = p_ano)
      select pi.ip, pi.ano,
             coalesce(ps.nickname,'') as nickname,
             coalesce(ps.game_count,0)::bigint as game_count
      from public.player_ip pi
      left join public.player_summary ps on ps.ano = pi.ano
      where pi.ip in (select ip from ips)
      order by pi.ip, game_count desc
    $fn$`);
  await dst.query(`revoke execute on function public.ip_shared_accounts(text) from public, anon`);
  await dst.query(`grant execute on function public.ip_shared_accounts(text) to authenticated`);
  console.log("  [ip] ip_shared_accounts 재작성(player_ip+player_summary, definer) + idx_gp_ano 인덱스");

  // 공식 등급 순위 목록 — player_grade(현재 Top200 + 이탈자 last-known, ~343명) 을 공식 순위순.
  //   닉네임은 player_summary 조인(RLS on/정책없음이라 definer 필요). official_grade(grades.mjs)와 같은 데이터.
  //   player_grade 가 아직 없을 수도 있으니(grades 워크플로 선행 전) 테이블 존재할 때만 생성.
  const hasGrade = (await dst.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name='player_grade'`,
  )).rowCount > 0;
  if (hasGrade) {
    await dst.query(`drop function if exists public.official_ranking()`);
    await dst.query(`
      create function public.official_ranking()
      returns table(rnk int, ano text, nickname text, grade int, grade_name text,
                    point int, games int, wins int, losses int, draws int, winrate numeric)
      language sql stable security definer set search_path = public, pg_temp as $fn$
        select pg.official_rank as rnk, pg.ano, coalesce(ps.nickname,'') as nickname,
               pg.grade, pg.grade_name, pg.point,
               pg.games, pg.wins, pg.losses, pg.draws, pg.winrate
        from public.player_grade pg
        left join public.player_summary ps on ps.ano = pg.ano
        order by pg.official_rank asc nulls last, pg.point desc nulls last
      $fn$`);
    await dst.query(`revoke execute on function public.official_ranking() from public, anon`);
    await dst.query(`grant execute on function public.official_ranking() to authenticated`);
    console.log("  [rank] official_ranking 생성(player_grade+player_summary, definer)");
  } else {
    console.log("  [rank] player_grade 없음 → official_ranking 생략(grades 워크플로 선행 필요)");
  }

  // 멀티서치(op.gg 멀티) — 닉네임 배열을 입력 순서대로 1행씩 해석해 전적·영웅 선호도 반환.
  //   각 닉 → player_summary 에서 정확일치(현재닉/과거닉/ano) 우선, 동률은 game_count 큰 계정.
  //   player_record / player_grade 를 left join. 두 소스의 컬럼은 워크플로 선후행에 따라
  //   아직 없을 수 있으니 존재 여부로 SELECT 식을 조건 구성(멱등·자가치유).
  const prHasHero = await hasCol("player_record", "like_hero");
  const prHasStreak = await hasCol("player_record", "streak");
  const likeSel = prHasHero ? "pr.like_hero" : "null::text";
  const maxHeroSel = prHasHero ? "pr.max_rate_hero" : "null::text";
  const streakSel = prHasStreak ? "pr.streak" : "null::int";
  const gradeJoin = hasGrade ? "left join public.player_grade pg on pg.ano = r.ano" : "";
  const gradeSel = hasGrade
    ? "pg.grade, coalesce(pg.grade_name, pr.grade_name) as grade_name, pg.official_rank, pg.point"
    : "pr.grade, pr.grade_name, null::int as official_rank, null::int as point";
  await dst.query(`
    create or replace function public.multi_search(p_nicks text[])
    returns table(idx int, input_nick text, found boolean,
      ano text, nickname text,
      grade int, grade_name text, official_rank int, point int,
      season_games int, season_wins int, season_losses int, season_winrate int,
      career_games int, career_wins int, career_losses int,
      ranked_total_games int, ranked_total_wins int, ranked_total_losses int,
      kill_avg numeric, assist_avg numeric, combat_rate_avg numeric, total_contribute numeric,
      like_hero text, max_rate_hero text, streak int, total_game_count bigint)
    language sql stable security definer set search_path = public, pg_temp as $fn$
      with inp as (
        select ord::int as idx, btrim(n) as input_nick
        from unnest(p_nicks) with ordinality as t(n, ord)
      ),
      resolved as (
        select i.idx, i.input_nick,
          (select ps.ano from public.player_summary ps
           where lower(ps.nickname) = lower(i.input_nick)
              or lower(ps.ano) = lower(i.input_nick)
              or exists (select 1 from unnest(ps.search_nicknames) sn where lower(sn) = lower(i.input_nick))
           order by (lower(ps.nickname) = lower(i.input_nick)) desc, ps.game_count desc nulls last
           limit 1) as ano
        from inp i
        where char_length(i.input_nick) >= 1
      )
      select r.idx, r.input_nick, (r.ano is not null) as found,
        r.ano, coalesce(ps.nickname, '') as nickname,
        ${gradeSel},
        pr.season_games, pr.season_wins, pr.season_losses, pr.season_winrate,
        pr.career_games, pr.career_wins, pr.career_losses,
        pr.ranked_total_games, pr.ranked_total_wins, pr.ranked_total_losses,
        pr.kill_avg, pr.assist_avg, pr.combat_rate_avg, pr.total_contribute,
        ${likeSel} as like_hero, ${maxHeroSel} as max_rate_hero, ${streakSel} as streak,
        coalesce(ps.game_count, 0)::bigint as total_game_count
      from resolved r
      left join public.player_summary ps on ps.ano = r.ano
      left join public.player_record pr on pr.ano = r.ano
      ${gradeJoin}
      order by r.idx
    $fn$`);
  await dst.query(`revoke execute on function public.multi_search(text[]) from public, anon`);
  await dst.query(`grant execute on function public.multi_search(text[]) to authenticated`);
  console.log(`  [multi] multi_search 생성(영웅선호 ${prHasHero ? "포함" : "대기"}, 등급 ${hasGrade ? "조인" : "생략"})`);
}

async function copyRange(table, where) {
  const sel = `SELECT * FROM public."${table}"${where ? " WHERE " + where : ""}`;
  const s = src.query(copyTo(`COPY (${sel}) TO STDOUT`));
  const d = dst.query(copyFrom(`COPY public."${table}" FROM STDIN`));
  await pipeline(s, d);
}

try {
  await src.connect();
  await dst.connect();

  // 1) game / game_player 증분 (gameID 범위 [wm, newMax])
  const wm = (await dst.query(`select coalesce(max("gameID"),'') m from public.game`)).rows[0].m;
  const newMax = (await src.query(`select coalesce(max("gameID"),'') m from public.game`)).rows[0].m;
  const esc = (v) => v.replace(/'/g, "''");
  console.log(`watermark=${wm} newMax=${newMax}`);
  if (newMax > wm) {
    const range = `"gameID" > '${esc(wm)}' and "gameID" <= '${esc(newMax)}'`;
    for (const t of ["game", "game_player"]) {
      const before = (await dst.query(`select count(*)::bigint n from public."${t}"`)).rows[0].n;
      await copyRange(t, range);
      const after = (await dst.query(`select count(*)::bigint n from public."${t}"`)).rows[0].n;
      console.log(`  [append] ${t.padEnd(14)} +${after - before} (now ${after})`);
    }
  } else {
    console.log("  새 게임 없음.");
  }

  // 2) 파생 테이블 전체 갱신 (작음). truncate+copy 를 한 트랜잭션으로 → 조회자는 끊김 없음.
  for (const t of ["player_ip", "player_winrate_summary", "suspect_pairs", "player_summary"]) {
    await dst.query("begin");
    await dst.query(`truncate public."${t}"`);
    await copyRange(t);
    await dst.query("commit");
    const n = (await dst.query(`select count(*)::bigint n from public."${t}"`)).rows[0].n;
    console.log(`  [refresh] ${t.padEnd(24)} ${n}`);
  }

  // 3) 검색 인프라 보장(멱등). 과거 search_players 는 game_player(100만행)⋈game 풀스캔 +
  //    선행 와일드카드 ilike 라 statement timeout 빈발 → 계정당 1행 player_summary + 트라이그램 인덱스로 교체.
  //    데이터 동기화 자체는 이미 끝났으므로 검색 인프라 실패가 sync 를 죽이지 않게 격리.
  try {
    await ensureSearchInfra(dst);
  } catch (e) {
    console.error("  [search] ensureSearchInfra 실패(데이터 sync 는 정상):", e.message);
  }

  console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.error("SYNC FAILED:", e.message);
  try { await dst.query("rollback"); } catch {}
  process.exitCode = 1;
} finally {
  await src.end().catch(() => {});
  await dst.end().catch(() => {});
}
