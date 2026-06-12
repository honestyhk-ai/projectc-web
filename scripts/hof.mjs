// 공식 "명예의 전당"(HallOfFame.aspx) 상위 100명을 긁어 lcmql 의 hall_of_fame 테이블에 적재.
// data-ano 가 페이지에 있어 우리 DB(game_player.ano)와 정확히 매칭된다.
// env: LCMQL_DB_URL (postgres 접속 URI). 없거나 --dry 면 파싱 결과만 출력(DB 미접속).
import pg from "pg";

const HOF_URL = "https://www.chaosonline.co.kr/statistics/HallOfFame.aspx";
const DRY = process.argv.includes("--dry") || !process.env.LCMQL_DB_URL;

const strip = (s) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const num = (s) => {
  const t = strip(s).replace(/[%,]/g, "");
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

function parseHof(html) {
  // 시즌(연도/시즌번호) — 선택된 option
  const year = parseInt((html.match(/id="ddlSeasonYear"[\s\S]*?<option selected="selected" value="(\d+)"/) || [])[1] || "0", 10);
  const season = parseInt((html.match(/id="ddlSeason"[\s\S]*?<option selected="selected" value="(\d+)"/) || [])[1] || "0", 10);

  const tbody = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
  const chunks = tbody.split(/(?=<tr class="hall-rank-history-trigger")/).filter((c) => c.includes("data-ano"));

  const rows = [];
  for (const c of chunks) {
    const ano = (c.match(/data-ano="(\d+)"/) || [])[1];
    if (!ano) continue;
    const nickname = strip((c.match(/data-name="([^"]*)"/) || [])[1] || "");
    const rank = parseInt((c.match(/class="rank-value">(\d+)</) || [])[1] || "0", 10);
    const gradeIcon = parseInt((c.match(/imgGrade_\d+"[^>]*\/img\/GradeIcon\/(\d+)\.png/) || [])[1] ?? "", 10);
    const gradeText = strip((c.match(/imgGrade_\d+"[^>]*data-tooltip-text="([^"]+)"/) || [])[1] || "");
    const seasonChange = strip((c.match(/lblHistoryRankChange_\d+"[^>]*>([^<]*)</) || [])[1] || "");
    const dailyChange = strip((c.match(/lblDailyRankChange_\d+"[^>]*>([^<]*)</) || [])[1] || "");

    // 셀 단위 분리: rank/nick 다음 t-center 숫자 셀 = 승률, KDA, 경기수, 평균기여도
    const tds = c.split("</td>");
    const nums = [];
    for (const td of tds) {
      if (!/class="t-center"/.test(td)) continue;
      if (td.includes("hall-of-fame-name-cell")) continue; // 닉네임 셀
      if (td.includes("rep-hero-icon") || td.includes("imgRepHero")) continue; // 대표영웅 셀
      const t = strip(td.replace(/<[^>]*>/g, " "));
      if (/^[\d.,%]+$/.test(t.replace(/\s/g, ""))) nums.push(td);
    }
    const winrate = num(nums[0] || "");
    const kda = num(nums[1] || "");
    const games = num(nums[2] || "");
    const contribution = num(nums[3] || "");

    // 대표영웅 1·2 (heroNo + 이름)
    const heroes = [...c.matchAll(/imgRepHero(\d)_\d+"[^>]*\/img\/heroicon\/(\d+)\.png[^>]*data-tooltip-title="([^"]*)"/g)];
    const hero1 = heroes[0]?.[2] || "";
    const hero1Name = strip(heroes[0]?.[3] || "");
    const hero2 = heroes[1]?.[2] || "";
    const hero2Name = strip(heroes[1]?.[3] || "");

    rows.push({
      rank, ano, nickname, gradeIcon: Number.isFinite(gradeIcon) ? gradeIcon : null, gradeText,
      seasonChange, dailyChange, winrate, kda, games: games == null ? null : Math.round(games),
      contribution, hero1, hero1Name, hero2, hero2Name,
    });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { year, season, rows };
}

const DDL = `
create table if not exists public.hall_of_fame (
  season_year int not null,
  season_no   int not null,
  rank        int not null,
  ano         text not null,
  nickname    text default '',
  grade_icon  int,
  grade_text  text default '',
  season_change text default '',
  daily_change  text default '',
  winrate     numeric,
  kda         numeric,
  games       int,
  contribution numeric,
  hero1 text default '', hero1_name text default '',
  hero2 text default '', hero2_name text default '',
  updated_at  timestamptz default now(),
  primary key (season_year, season_no, ano)
)`;

async function main() {
  const res = await fetch(HOF_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "ko-KR,ko" },
  });
  if (!res.ok) throw new Error(`HOF fetch ${res.status}`);
  const html = await res.text();
  const { year, season, rows } = parseHof(html);
  console.log(`parsed season=${year}년 ${season}시즌, rows=${rows.length}`);
  if (rows.length < 50) throw new Error(`행 수가 비정상(${rows.length}) — 페이지 구조 변경 의심`);

  if (DRY) {
    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
    console.log(`(dry-run: DB 미접속) 전체 ${rows.length}행`);
    return;
  }

  const db = new pg.Client({ connectionString: process.env.LCMQL_DB_URL.split("?")[0], ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query(DDL);
    await db.query("begin");
    await db.query("delete from public.hall_of_fame where season_year=$1 and season_no=$2", [year, season]);
    const cols = "season_year,season_no,rank,ano,nickname,grade_icon,grade_text,season_change,daily_change,winrate,kda,games,contribution,hero1,hero1_name,hero2,hero2_name";
    const vals = [];
    const ph = [];
    let i = 1;
    for (const r of rows) {
      ph.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      vals.push(year, season, r.rank, r.ano, r.nickname, r.gradeIcon, r.gradeText, r.seasonChange, r.dailyChange,
        r.winrate, r.kda, r.games, r.contribution, r.hero1, r.hero1Name, r.hero2, r.hero2Name);
    }
    await db.query(`insert into public.hall_of_fame (${cols}) values ${ph.join(",")}`, vals);
    await db.query("commit");
    console.log(`hall_of_fame 적재 완료: ${year}년 ${season}시즌 ${rows.length}행`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((e) => { console.error("HOF FAILED:", e.message); process.exit(1); });
