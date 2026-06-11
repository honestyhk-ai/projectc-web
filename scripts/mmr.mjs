// 랭크 경기 결과로 Elo(MMR) 계산. 개인 레이팅 데이터가 없어 직접 산출.
// 랭크 = roomType '3', liveType '0', winnerTeam ∈ (E,U). 신성연합(campType 0) vs 불사군단(1).
const K = 24;
const START = 1500;

export async function computeMmr(client) {
  await client.query(`
    create table if not exists public.player_mmr (
      ano text primary key, mmr integer, games integer, wins integer, losses integer,
      updated_at timestamptz default now()
    )`);

  const { rows } = await client.query(`
    select g."gameID", gp.ano, gp."campType", g."winnerTeam"
    from game g join game_player gp on gp."gameID" = g."gameID"
    where g."roomType"='3' and g."liveType"='0' and g."winnerTeam" in ('E','U')
      and gp."campType" in ('0','1') and gp.ano <> ''
    order by g.date asc, g."gameID" asc`);

  // 게임 단위로 묶기 (쿼리가 date 순이므로 gameID 연속)
  const games = [];
  let cur = null;
  for (const r of rows) {
    if (!cur || cur.id !== r.gameID) {
      cur = { id: r.gameID, winner: r.winnerTeam, t0: [], t1: [] };
      games.push(cur);
    }
    (r.campType === "0" ? cur.t0 : cur.t1).push(r.ano);
  }

  const R = new Map(), G = new Map(), W = new Map();
  const get = (a) => (R.has(a) ? R.get(a) : START);
  for (const gm of games) {
    if (!gm.t0.length || !gm.t1.length) continue;
    const avg = (t) => t.reduce((s, a) => s + get(a), 0) / t.length;
    const r0 = avg(gm.t0), r1 = avg(gm.t1);
    const e0 = 1 / (1 + Math.pow(10, (r1 - r0) / 400));
    const s0 = gm.winner === "E" ? 1 : 0; // E=신성연합(campType 0) 승
    for (const a of gm.t0) { R.set(a, get(a) + K * (s0 - e0)); G.set(a, (G.get(a) || 0) + 1); if (s0) W.set(a, (W.get(a) || 0) + 1); }
    for (const a of gm.t1) { R.set(a, get(a) + K * ((1 - s0) - (1 - e0))); G.set(a, (G.get(a) || 0) + 1); if (!s0) W.set(a, (W.get(a) || 0) + 1); }
  }

  // player_mmr 갱신 (truncate + chunk insert)
  await client.query("begin");
  await client.query("truncate public.player_mmr");
  const entries = [...R.entries()];
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const vals = [], params = [];
    let p = 1;
    for (const [a, r] of chunk) {
      const g = G.get(a) || 0, w = W.get(a) || 0;
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(a, Math.round(r), g, w, g - w);
    }
    await client.query(
      `insert into public.player_mmr (ano,mmr,games,wins,losses) values ${vals.join(",")}`,
      params,
    );
  }
  await client.query("commit");
  return { players: R.size, games: games.length };
}
