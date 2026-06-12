// 공식 "명예의 전당"(HallOfFame.aspx) 상위 100명을 긁어 lcmql 의 hall_of_fame 테이블에 적재.
// data-ano 가 페이지에 있어 우리 DB(game_player.ano)와 정확히 매칭된다.
// env: LCMQL_DB_URL (postgres 접속 URI). 없거나 --dry 면 파싱 결과만 출력(DB 미접속).
import pg from "pg";

const HOF_URL = "https://www.chaosonline.co.kr/statistics/HallOfFame.aspx";
const HISTORY_URL = HOF_URL + "/GetHallOfFameHistory"; // ano별 일별 스냅샷(현재 등급/점수/순위) 공개 웹메서드
const DRY = process.argv.includes("--dry") || !process.env.LCMQL_DB_URL;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

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

// ano별 공개 일별 스냅샷에서 "현재"(IsCurrentRank, 없으면 최신) 한 건을 뽑아 게임 내 '내 정보'와 동일한
// 현재 세부등급/점수/순위/전적을 채운다. 공식이 Top200 진입 이력만 제공하므로 그 밖이면 null.
function pickLiveSnapshot(data) {
  const daily = (data?.d?.DailyHistory || []).filter((d) => d.HasData);
  if (!daily.length) return null;
  const snap = daily.find((d) => d.IsCurrentRank) || daily[daily.length - 1];
  const date = (snap.LogDate || "").match(/\/Date\((\d+)\)\//);
  return {
    point: Number.isFinite(snap.Point) ? snap.Point : null,
    liveGrade: Number.isFinite(snap.Grade) ? snap.Grade : null,
    liveGradeName: snap.GradeName || "",
    liveRank: Number.isFinite(snap.Rank) ? snap.Rank : null,
    snapshotDate: date ? new Date(+date[1]).toISOString().slice(0, 10) : null,
  };
}

async function fetchSnapshot(ano, year, season) {
  try {
    const r = await fetch(HISTORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": UA, "Accept-Language": "ko-KR,ko" },
      body: JSON.stringify({ ano: Number(ano), seasonYear: year, seasonNo: season }),
    });
    if (!r.ok) return null;
    return pickLiveSnapshot(await r.json());
  } catch {
    return null;
  }
}

// 동시성 제한으로 Top100 각 ano의 현재 스냅샷을 채운다(공식 서버 예의).
async function enrichLiveSnapshots(rows, year, season, concurrency = 6) {
  let i = 0;
  let filled = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      const snap = await fetchSnapshot(row.ano, year, season);
      if (snap) {
        Object.assign(row, snap);
        if (snap.point != null || snap.liveGradeName) filled++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return filled;
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
  point          int,          -- 현재 점수 (게임 내 '내 정보'와 동일, 일별 스냅샷)
  live_grade     int,          -- 현재 세부 등급 아이콘 번호 0~20
  live_grade_name text default '', -- 예: '사파이어 5'
  live_rank      int,          -- 현재(일별) 순위
  snapshot_date  date,         -- 스냅샷 기준일
  updated_at  timestamptz default now(),
  primary key (season_year, season_no, ano)
)`;

// 테이블이 처음 생성될 때부터 RLS 켜둠(anon 직접 노출 차단).
const ENABLE_RLS = `alter table public.hall_of_fame enable row level security`;

// RLS(정책 없음=anon 0행) + 최신시즌 조회 RPC(security definer, authenticated 전용). 멱등.
// 수동 SQL(supabase/hall_of_fame.sql) 없이 스크래퍼가 자동 적용 → 운영 단순화.
const SETUP = [
  // 기존 테이블 업그레이드(컬럼 추가). 새 설치엔 DDL이 이미 포함.
  `alter table public.hall_of_fame
     add column if not exists point int,
     add column if not exists live_grade int,
     add column if not exists live_grade_name text default '',
     add column if not exists live_rank int,
     add column if not exists snapshot_date date`,
  `create index if not exists idx_hall_of_fame_rank on public.hall_of_fame (season_year desc, season_no desc, rank)`,
  `create index if not exists idx_hall_of_fame_ano on public.hall_of_fame (ano, season_year desc, season_no desc)`,
  `create or replace function public.hall_of_fame_current()
   returns setof public.hall_of_fame
   language sql stable security definer set search_path = public as $fn$
     select * from public.hall_of_fame
     where (season_year, season_no) = (
       select season_year, season_no from public.hall_of_fame
       order by season_year desc, season_no desc limit 1)
     order by rank;
   $fn$`,
  // 특정 계정의 최신 시즌 명예의 전당 1행(프로필 '공식 랭킹' 카드용).
  `create or replace function public.hall_of_fame_player(p_ano text)
   returns setof public.hall_of_fame
   language sql stable security definer set search_path = public as $fn$
     select * from public.hall_of_fame
     where ano = p_ano
     order by season_year desc, season_no desc
     limit 1;
   $fn$`,
  `revoke execute on function public.hall_of_fame_current() from public, anon`,
  `revoke execute on function public.hall_of_fame_player(text) from public, anon`,
  `grant execute on function public.hall_of_fame_current() to authenticated`,
  `grant execute on function public.hall_of_fame_player(text) to authenticated`,
];

async function main() {
  const res = await fetch(HOF_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" },
  });
  if (!res.ok) throw new Error(`HOF fetch ${res.status}`);
  const html = await res.text();
  const { year, season, rows } = parseHof(html);
  console.log(`parsed season=${year}년 ${season}시즌, rows=${rows.length}`);
  if (rows.length < 50) throw new Error(`행 수가 비정상(${rows.length}) — 페이지 구조 변경 의심`);

  // 각 ano의 현재 등급/점수/순위(게임 내 '내 정보') 채우기
  const filled = await enrichLiveSnapshots(rows, year, season);
  console.log(`live 스냅샷 채움: ${filled}/${rows.length} (점수/세부등급/현재순위)`);

  if (DRY) {
    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
    console.log(`(dry-run: DB 미접속) 전체 ${rows.length}행`);
    return;
  }

  const db = new pg.Client({ connectionString: process.env.LCMQL_DB_URL.split("?")[0], ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query(DDL);
    await db.query(ENABLE_RLS);
    for (const stmt of SETUP) await db.query(stmt);
    await db.query("begin");
    await db.query("delete from public.hall_of_fame where season_year=$1 and season_no=$2", [year, season]);
    const cols = "season_year,season_no,rank,ano,nickname,grade_icon,grade_text,season_change,daily_change,winrate,kda,games,contribution,hero1,hero1_name,hero2,hero2_name,point,live_grade,live_grade_name,live_rank,snapshot_date";
    const vals = [];
    const ph = [];
    let i = 1;
    for (const r of rows) {
      ph.push(`(${Array.from({ length: 22 }, () => `$${i++}`).join(",")})`);
      vals.push(year, season, r.rank, r.ano, r.nickname, r.gradeIcon, r.gradeText, r.seasonChange, r.dailyChange,
        r.winrate, r.kda, r.games, r.contribution, r.hero1, r.hero1Name, r.hero2, r.hero2Name,
        r.point ?? null, r.liveGrade ?? null, r.liveGradeName ?? "", r.liveRank ?? null, r.snapshotDate ?? null);
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
