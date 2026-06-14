// 일회용 진단: 특정 ano 의 우리 DB 보유량 vs 집계 경로별 카운트를 출력.
// 주력영웅(player_heroes) 합계가 총전적과 안 맞는 원인(표본부족 vs join/필터 누락) 판별용.
// env: LCMQL_DB_URL.  실행: node scripts/diag.mjs [ano]
import pg from "pg";

const DST = (process.env.LCMQL_DB_URL || "").split("?")[0];
if (!DST) { console.error("LCMQL_DB_URL 미설정"); process.exit(1); }
const ano = process.argv[2] || "8040";

const db = new pg.Client({ connectionString: DST, ssl: { rejectUnauthorized: false } });
await db.connect();

const q = async (label, sql, params = []) => {
  try {
    const r = await db.query(sql, params);
    console.log(`[${label}]`, JSON.stringify(r.rows));
  } catch (e) {
    console.log(`[${label}] ERR ${e.message}`);
  }
};

console.log(`=== 진단 ano=${ano} ===`);
await q("player_summary", `select ano,nickname,game_count from public.player_summary where ano=$1`, [ano]);
await q("winrate_summary", `select total_games,total_wins,draws,normal_games,ranked_games,ranked_wins from public.player_winrate_summary where ano=$1`, [ano]);
await q("gp_total", `select count(*)::int n from public.game_player where ano=$1`, [ano]);
await q("gp_hero_nonempty", `select count(*)::int n from public.game_player where ano=$1 and "heroNo"<>''`, [ano]);
await q("gp_inner_join_game", `select count(*)::int n from public.game_player gp join public.game g on gp."gameID"=g."gameID" where gp.ano=$1 and gp."heroNo"<>''`, [ano]);
await q("gp_roomType_dist", `select "roomType", count(*)::int n from public.game_player gp join public.game g on gp."gameID"=g."gameID" where gp.ano=$1 group by "roomType" order by n desc`, [ano]);
await q("player_heroes_sum", `select coalesce(sum(games),0)::int total_games, count(*)::int hero_kinds from public.player_heroes($1)`, [ano]);
await q("distinct_heroNo", `select count(distinct "heroNo")::int n from public.game_player where ano=$1 and "heroNo"<>''`, [ano]);
await q("by_nick_cash", `select ano,nickname,game_count from public.player_summary where nickname ilike '%cash%' order by game_count desc nulls last limit 10`);

await db.end();
