// 게임 클라이언트 공개 API(RecordInfo.aspx, 인증 불필요)로 모든 플레이어의
// 현재 등급 + 평균 디스펠/포션/킬/어시/기여도 + 이번시즌 랭크전적을 player_record 에 적재.
//   엔드포인트: http://www.chaosonline.co.kr:8081/ClientJson/RecordInfo.aspx?ano=..&recordType=..&tabType=..
//     recordType 0=전체모드 1=랭킹대전 / tabType S=이번시즌 A=전시즌누적.
//   per-ano 3회 호출: ① rt=0&tab=A(통산 평균스탯+등급) ② rt=1&tab=S(이번시즌 랭크) ③ rt=1&tab=A(랭크 전시즌누적).
//   8081 은 과거 한국 지오제한이었으나 현재 GitHub Actions(US)에서도 접속됨(실측).
//   비표준 JSON(키 따옴표X, trailing comma)이라 정규식으로 필드 추출.
// env: LCMQL_DB_URL. --dry 면 DB 없이 샘플 출력.
import pg from "pg";

const BASE = "http://www.chaosonline.co.kr:8081/ClientJson/RecordInfo.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const DRY = process.argv.includes("--dry") || !process.env.LCMQL_DB_URL;
const CONCURRENCY = 6;

const numf = (t, k) => {
  const v = (t.match(new RegExp(k + ':"([^"]*)"')) || [])[1];
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const intf = (t, k) => {
  const n = numf(t, k);
  return n == null ? null : Math.round(n);
};
const strf = (t, k) => (t.match(new RegExp(k + ':"([^"]*)"')) || [])[1] || "";

async function fetchRecord(ano, recordType, tabType) {
  const url = `${BASE}?ano=${ano}&recordType=${recordType}&year=0&seasonNo=0&characterNo=0&tabType=${tabType}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t.includes("basicInfo")) return null; // 빈 껍데기(HTML) 방어
    return t;
  } catch {
    return null;
  }
}

async function collect(ano) {
  const career = await fetchRecord(ano, 0, "A"); // 통산 전체모드: 등급 + 평균 스탯
  if (!career) return null;
  const grade_name = strf(career, "basicGradeName");
  if (!grade_name) return null; // 기록 없는 계정
  const season = await fetchRecord(ano, 1, "S"); // 이번시즌 랭크 승패
  const rankedAll = await fetchRecord(ano, 1, "A"); // 랭크모드 전시즌누적 승패

  const row = {
    ano: String(ano),
    grade_name,
    grade: intf(career, "basicGrade"),
    grade_icon: strf(career, "basicGradeIcon"),
    // 통산(전체모드) 평균 스탯
    total_contribute: numf(career, "totalContribute"),
    combat_contribute_avg: numf(career, "combatContributeAvg"),
    combat_rate_avg: numf(career, "combatRateAvg"),
    kill_avg: numf(career, "killCntAvg"),
    assist_avg: numf(career, "assistCntAvg"),
    level_avg: numf(career, "lastLevelAvg"),
    gold_avg: numf(career, "totalGoldAvg"),
    dispel_avg: numf(career, "dispellCntAvg"),
    potion_avg: numf(career, "potionCntAvg"),
    creep_kill_avg: numf(career, "creepKillCntAvg"),
    career_games: intf(career, "playCount"),
    career_wins: intf(career, "totalWinCount"),
    career_losses: intf(career, "totalLoseCount"),
    career_draws: intf(career, "totalDrawCount"),
    // 랭킹대전 전시즌누적 승패 (모든 시즌 랭크)
    ranked_total_games: rankedAll ? intf(rankedAll, "playCount") : null,
    ranked_total_wins: rankedAll ? intf(rankedAll, "totalWinCount") : null,
    ranked_total_losses: rankedAll ? intf(rankedAll, "totalLoseCount") : null,
    ranked_total_draws: rankedAll ? intf(rankedAll, "totalDrawCount") : null,
    // 이번시즌 랭킹대전 승패
    season_games: season ? intf(season, "playCount") : null,
    season_wins: season ? intf(season, "totalWinCount") : null,
    season_losses: season ? intf(season, "totalLoseCount") : null,
    season_draws: season ? intf(season, "totalDrawCount") : null,
    season_winrate: season ? intf(season, "totalWinRate") : null,
  };
  return row;
}

async function enrich(anos) {
  const rows = [];
  let i = 0, done = 0;
  async function worker() {
    while (i < anos.length) {
      const ano = anos[i++];
      const row = await collect(ano);
      if (row) rows.push(row);
      if (++done % 500 === 0) console.log(`  진행 ${done}/${anos.length} (적재 ${rows.length})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return rows;
}

const DDL = `
create table if not exists public.player_record (
  ano text primary key,
  grade_name text default '',
  grade int,
  grade_icon text default '',
  total_contribute numeric,
  combat_contribute_avg numeric,
  combat_rate_avg numeric,
  kill_avg numeric,
  assist_avg numeric,
  level_avg numeric,
  gold_avg numeric,
  dispel_avg numeric,
  potion_avg numeric,
  creep_kill_avg numeric,
  career_games int, career_wins int, career_losses int, career_draws int,
  ranked_total_games int, ranked_total_wins int, ranked_total_losses int, ranked_total_draws int,
  season_games int, season_wins int, season_losses int, season_draws int, season_winrate int,
  updated_at timestamptz default now()
)`;

const SETUP = [
  `alter table public.player_record enable row level security`,
  // 기존 테이블 업그레이드(멱등): 랭크 전시즌누적 컬럼 추가
  `alter table public.player_record add column if not exists ranked_total_games int`,
  `alter table public.player_record add column if not exists ranked_total_wins int`,
  `alter table public.player_record add column if not exists ranked_total_losses int`,
  `alter table public.player_record add column if not exists ranked_total_draws int`,
  `create or replace function public.official_record(p_ano text)
   returns setof public.player_record
   language sql stable security definer set search_path = public as $fn$
     select * from public.player_record where ano = p_ano limit 1;
   $fn$`,
  `revoke execute on function public.official_record(text) from public, anon`,
  `grant execute on function public.official_record(text) to authenticated`,
  // 이번 시즌 랭킹대전 순위 — 클라이언트 전투 평점(combat_rate_avg) 내림차순 단일 정렬.
  //   닉네임은 player_summary 조인. (구 p_sort 토글 제거)
  `drop function if exists public.season_ranking(text)`,
  `drop function if exists public.season_ranking()`,
  `create function public.season_ranking()
   returns table(rnk bigint, ano text, nickname text, grade int, grade_name text,
                 rating numeric, games int, wins int, losses int, draws int, winrate numeric)
   language sql stable security definer set search_path = public, pg_temp as $fn$
     with base as (
       select pr.ano, pr.grade, pr.grade_name,
              round(coalesce(pr.combat_rate_avg, 0)::numeric, 2) as rating,
              pr.season_games as games, pr.season_wins as wins,
              greatest(coalesce(pr.season_games,0)-coalesce(pr.season_wins,0)-coalesce(pr.season_draws,0),0) as losses,
              coalesce(pr.season_draws,0) as draws,
              coalesce(pr.season_winrate,0) as winrate
       from public.player_record pr
       where coalesce(pr.season_games,0) > 0
     )
     select row_number() over (order by b.rating desc nulls last, b.wins desc, b.games desc) as rnk,
            b.ano, coalesce(ps.nickname,'') as nickname, b.grade, b.grade_name,
            b.rating, b.games, b.wins, b.losses, b.draws, b.winrate
     from base b left join public.player_summary ps on ps.ano = b.ano
     order by rnk;
   $fn$`,
  `revoke execute on function public.season_ranking() from public, anon`,
  `grant execute on function public.season_ranking() to authenticated`,
];

const COLS = "ano,grade_name,grade,grade_icon,total_contribute,combat_contribute_avg,combat_rate_avg,kill_avg,assist_avg,level_avg,gold_avg,dispel_avg,potion_avg,creep_kill_avg,career_games,career_wins,career_losses,career_draws,ranked_total_games,ranked_total_wins,ranked_total_losses,ranked_total_draws,season_games,season_wins,season_losses,season_draws,season_winrate";
const COLN = COLS.split(",").length;

async function main() {
  const db = DRY ? null : new pg.Client({ connectionString: process.env.LCMQL_DB_URL.split("?")[0], ssl: { rejectUnauthorized: false } });
  if (db) {
    await db.connect();
    await db.query(DDL);
    for (const stmt of SETUP) await db.query(stmt);
  }

  let anos;
  if (db) {
    anos = (await db.query(`select ano from public.player_winrate_summary`)).rows.map((r) => r.ano);
  } else {
    anos = ["27938", "98", "520", "11136", "26914"];
  }
  console.log(`조회 대상: ${anos.length}명 (per-ano 3회 호출)`);

  const rows = await enrich(anos);
  console.log(`기록 보유: ${rows.length}명`);

  if (!db) {
    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
    console.log("(dry-run)");
    return;
  }

  try {
    await db.query("begin");
    await db.query("truncate public.player_record");
    const CHUNK = 500;
    for (let k = 0; k < rows.length; k += CHUNK) {
      const batch = rows.slice(k, k + CHUNK);
      const ph = [];
      const vals = [];
      let p = 1;
      for (const r of batch) {
        ph.push(`(${Array.from({ length: COLN }, () => `$${p++}`).join(",")})`);
        vals.push(r.ano, r.grade_name, r.grade, r.grade_icon, r.total_contribute, r.combat_contribute_avg, r.combat_rate_avg,
          r.kill_avg, r.assist_avg, r.level_avg, r.gold_avg, r.dispel_avg, r.potion_avg, r.creep_kill_avg,
          r.career_games, r.career_wins, r.career_losses, r.career_draws,
          r.ranked_total_games, r.ranked_total_wins, r.ranked_total_losses, r.ranked_total_draws,
          r.season_games, r.season_wins, r.season_losses, r.season_draws, r.season_winrate);
      }
      await db.query(`insert into public.player_record (${COLS}) values ${ph.join(",")}`, vals);
    }
    await db.query("commit");
    console.log(`player_record 적재 완료: ${rows.length}행`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((e) => { console.error("RECORD FAILED:", e.message); process.exit(1); });
