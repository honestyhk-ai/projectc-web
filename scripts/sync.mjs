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

  console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.error("SYNC FAILED:", e.message);
  try { await dst.query("rollback"); } catch {}
  process.exitCode = 1;
} finally {
  await src.end().catch(() => {});
  await dst.end().catch(() => {});
}
