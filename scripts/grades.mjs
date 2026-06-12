// 시즌 랭크 참가자 전원의 "현재 공식 등급/점수"(게임 내 '내 정보'와 동일)를 player_grade 에 적재.
// 공식은 GetHallOfFameHistory 로 Top200 진입자만 공개 → 우리 DB 의 랭크 참가자 ano 를 일일이 조회해
// 현재 시즌 일별 스냅샷(IsCurrentRank)이 있는 계정만 저장. 그 밖(Top200 밖)은 행 없음 = 비공개.
// 등급은 일 단위로 갱신되므로 하루 1회 실행이면 충분(.github/workflows/grades.yml).
// env: LCMQL_DB_URL. --dry 면 DB 없이 파싱/수집 결과만 출력.
import pg from "pg";

const PAGE = "https://www.chaosonline.co.kr/statistics/HallOfFame.aspx";
const HISTORY_URL = PAGE + "/GetHallOfFameHistory";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const DRY = process.argv.includes("--dry") || !process.env.LCMQL_DB_URL;
const CONCURRENCY = 6;

// 현재 시즌(연/시즌번호)을 명예의 전당 페이지의 selected option 에서 읽는다.
async function currentSeason() {
  const html = await (await fetch(PAGE, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" } })).text();
  const year = parseInt((html.match(/id="ddlSeasonYear"[\s\S]*?<option selected="selected" value="(\d+)"/) || [])[1] || "0", 10);
  const season = parseInt((html.match(/id="ddlSeason"[\s\S]*?<option selected="selected" value="(\d+)"/) || [])[1] || "0", 10);
  return { year, season };
}

// ano 의 현재 일별 스냅샷 1건 → 게임 내 '내 정보'와 동일한 등급/점수/순위/전적/기여도.
async function fetchGrade(ano, year, season) {
  try {
    const r = await fetch(HISTORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": UA, "Accept-Language": "ko-KR,ko" },
      body: JSON.stringify({ ano: Number(ano), seasonYear: year, seasonNo: season }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const daily = (data?.d?.DailyHistory || []).filter((d) => d.HasData);
    if (!daily.length) return null; // Top200 진입 이력 없음 → 공식 등급 비공개
    const s = daily.find((d) => d.IsCurrentRank) || daily[daily.length - 1];
    const wins = s.WinCount ?? 0;
    const losses = s.LoseCount ?? 0;
    const draws = s.DrawCount ?? 0;
    const games = wins + losses + draws;
    const date = (s.LogDate || "").match(/\/Date\((\d+)\)\//);
    return {
      ano: String(ano),
      grade: Number.isFinite(s.Grade) ? s.Grade : null,
      grade_name: s.GradeName || "",
      point: Number.isFinite(s.Point) ? s.Point : null,
      official_rank: Number.isFinite(s.Rank) ? s.Rank : null,
      wins, losses, draws, games,
      winrate: games ? Math.round((1000 * wins) / games) / 10 : null,
      contribution: Number.isFinite(s.ContributeCentuple) ? Math.round(s.ContributeCentuple) / 100 : null,
      snapshot_date: date ? new Date(+date[1]).toISOString().slice(0, 10) : null,
    };
  } catch {
    return null;
  }
}

async function enrich(anos, year, season) {
  const rows = [];
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < anos.length) {
      const ano = anos[i++];
      const g = await fetchGrade(ano, year, season);
      if (g) rows.push(g);
      if (++done % 250 === 0) console.log(`  진행 ${done}/${anos.length} (현재 ${rows.length}건 적재대상)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return rows;
}

const DDL = `
create table if not exists public.player_grade (
  ano           text primary key,
  season_year   int,
  season_no     int,
  grade         int,          -- 등급 아이콘 번호 0~20 (0=다이아, 1~5루비, 6~10자수정, 11~15사파이어, 16~20에메랄드)
  grade_name    text default '', -- 예: '루비 1', '에메랄드 5', '다이아몬드'
  point         int,          -- 점수 (다이아몬드는 보통 0)
  official_rank int,          -- 현재(일별) 공식 순위 1~200
  wins int, losses int, draws int, games int,
  winrate       numeric,
  contribution  numeric,      -- 평균 기여도 (ContributeCentuple/100)
  snapshot_date date,
  updated_at    timestamptz default now()
)`;

// 테이블 생성 시점부터 RLS on(정책 없음 = anon 직접 노출 0행). 조회는 security definer RPC 로만.
const SETUP = [
  `alter table public.player_grade enable row level security`,
  // 특정 계정의 공식 현재 등급 1행(프로필 카드용).
  `create or replace function public.official_grade(p_ano text)
   returns setof public.player_grade
   language sql stable security definer set search_path = public as $fn$
     select * from public.player_grade where ano = p_ano limit 1;
   $fn$`,
  `revoke execute on function public.official_grade(text) from public, anon`,
  `grant execute on function public.official_grade(text) to authenticated`,
];

async function main() {
  const { year, season } = await currentSeason();
  if (!year || !season) throw new Error("현재 시즌 파싱 실패 — 페이지 구조 변경 의심");
  console.log(`현재 시즌 ${year}년 ${season}시즌`);

  const db = DRY ? null : new pg.Client({ connectionString: process.env.LCMQL_DB_URL.split("?")[0], ssl: { rejectUnauthorized: false } });
  if (db) {
    await db.connect();
    await db.query(DDL);
    for (const stmt of SETUP) await db.query(stmt);
  }

  // 랭크 참가자 ano 목록. DRY 면 페이지 Top100 으로 샘플.
  let anos;
  if (db) {
    anos = (await db.query(`select ano from public.player_winrate_summary where ranked_games > 0`)).rows.map((r) => r.ano);
  } else {
    const html = await (await fetch(PAGE, { headers: { "User-Agent": UA } })).text();
    anos = [...new Set([...html.matchAll(/data-ano="(\d+)"/g)].map((m) => m[1]))];
  }
  console.log(`조회 대상 랭크 참가자: ${anos.length}명`);

  const rows = await enrich(anos, year, season);
  console.log(`공식 등급 보유(Top200 진입): ${rows.length}명`);

  if (!db) {
    console.log(JSON.stringify(rows.slice(0, 5).map((r) => ({ ano: r.ano, g: `${r.grade_name} ${r.point}점`, rank: r.official_rank })), null, 2));
    console.log("(dry-run: DB 미접속)");
    return;
  }

  try {
    await db.query("begin");
    await db.query("truncate public.player_grade");
    if (rows.length) {
      const cols = "ano,season_year,season_no,grade,grade_name,point,official_rank,wins,losses,draws,games,winrate,contribution,snapshot_date";
      const ph = [];
      const vals = [];
      let i = 1;
      for (const r of rows) {
        ph.push(`(${Array.from({ length: 14 }, () => `$${i++}`).join(",")})`);
        vals.push(r.ano, year, season, r.grade, r.grade_name, r.point, r.official_rank,
          r.wins, r.losses, r.draws, r.games, r.winrate, r.contribution, r.snapshot_date);
      }
      await db.query(`insert into public.player_grade (${cols}) values ${ph.join(",")}`, vals);
    }
    await db.query("commit");
    console.log(`player_grade 적재 완료: ${rows.length}행 (${year}년 ${season}시즌)`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((e) => { console.error("GRADES FAILED:", e.message); process.exit(1); });
