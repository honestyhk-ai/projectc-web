// 온디맨드 "랭킹대전 영웅(공식 전체시즌)" 수집 프록시.
//   우리 game_player 표본은 일부라 영웅수가 공식 총전적과 안 맞음 →
//   공식 서버 RecordInfo?characterNo={heroNo}&recordType=1&tabType=A 로 영웅별 전시즌 랭크 전적을 가져옴.
//   흐름: 로그인 사용자 → invoke('ranked-heroes',{ano}) → 영웅 112종 조회 → player_hero_ranked upsert → 반환.
//   배포: npx supabase functions deploy ranked-heroes --project-ref lcmqltmztcklyptibqvi
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "http://www.chaosonline.co.kr:8081/ClientJson/RecordInfo.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const intf = (t: string, k: string) => {
  const m = t.match(new RegExp(k + ':"([^"]*)"'));
  if (!m || m[1] === "") return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
};

// 전체 영웅 번호(public/heroes/{heroNo}.png 기준).
const HEROES = ["111101","111102","111103","111104","111105","111106","111107","111111","111112","111113","111114","111117","111118","111119","112101","112102","112103","112104","112105","112108","112201","112202","112203","112204","112205","112206","112207","112208","112209","112211","112212","112213","113201","113202","113203","113204","113205","113206","113207","113208","113209","113210","113211","113212","113214","113215","211101","211102","211103","211104","211105","211106","211108","211109","211110","211111","211112","211113","211114","211115","211116","211117","211201","211202","211203","212101","212102","212103","212105","212106","212107","212201","212202","212203","212204","212205","212207","212208","212209","212210","213201","213202","213203","213204","213205","213206","213207","213208","213209","213210","213211","213212","311102","311103","311104","311108","311201","312102","312201","312203","312207","313205","411102","411111","411112","412102","412104","412205","413202","413204","413206","413208"];

async function heroRanked(ano: string, heroNo: string) {
  const url = `${BASE}?ano=${ano}&recordType=1&year=0&seasonNo=0&characterNo=${heroNo}&tabType=A`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t.includes("basicInfo")) return null;
    const wins = intf(t, "totalWinCount");
    const losses = intf(t, "totalLoseCount");
    const games = wins + losses;
    if (games <= 0) return null;
    return { hero_no: heroNo, games, wins, losses, select_count: intf(t, "selectCharacterCount") };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let ano = "";
  try {
    ano = String((await req.json()).ano ?? "").trim();
  } catch { /* ignore */ }
  if (!/^\d+$/.test(ano)) return json({ error: "bad ano" }, 400);

  // 영웅 112종을 동시성 10으로 조회.
  const rows: Array<{ hero_no: string; games: number; wins: number; losses: number; select_count: number }> = [];
  let i = 0;
  const worker = async () => {
    while (i < HEROES.length) {
      const h = HEROES[i++];
      const r = await heroRanked(ano, h);
      if (r) rows.push(r);
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  rows.sort((a, b) => b.games - a.games);

  // service role 로 교체 저장(RLS 우회). 실패해도 결과는 반환.
  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("player_hero_ranked").delete().eq("ano", ano);
    if (rows.length) {
      const now = new Date().toISOString();
      await admin.from("player_hero_ranked").insert(rows.map((r) => ({ ...r, ano, updated_at: now })));
    }
  } catch { /* 반환은 계속 */ }

  return json({ ano, heroes: rows, total_games: rows.reduce((s, r) => s + r.games, 0) });
});
