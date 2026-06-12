// 온디맨드 "새로고침" 프록시.
//   브라우저(HTTPS)는 게임 서버(http://...:8081)를 혼합콘텐츠로 직접 못 부르므로 이 Edge Function 이 중계.
//   흐름: 로그인 사용자 → invoke('refresh-record',{ano}) → RecordInfo.aspx 조회 → player_record upsert → 최신 row 반환.
//   배포: supabase functions deploy refresh-record  (SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY 는 런타임 자동 주입)
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

const numf = (t: string, k: string) => {
  const m = t.match(new RegExp(k + ':"([^"]*)"'));
  if (!m || m[1] === "") return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
};
const intf = (t: string, k: string) => {
  const n = numf(t, k);
  return n == null ? null : Math.round(n);
};
const strf = (t: string, k: string) => (t.match(new RegExp(k + ':"([^"]*)"')) || [])[1] || "";

async function fetchRecord(ano: string, recordType: number, tabType: string): Promise<string | null> {
  const url = `${BASE}?ano=${ano}&recordType=${recordType}&year=0&seasonNo=0&characterNo=0&tabType=${tabType}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const t = await r.text();
    return t.includes("basicInfo") ? t : null;
  } catch {
    return null;
  }
}

async function collect(ano: string) {
  const career = await fetchRecord(ano, 0, "A");
  if (!career) return null;
  const grade_name = strf(career, "basicGradeName");
  if (!grade_name) return null;
  const season = await fetchRecord(ano, 1, "S");
  return {
    ano,
    grade_name,
    grade: intf(career, "basicGrade"),
    grade_icon: strf(career, "basicGradeIcon"),
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
    season_games: season ? intf(season, "playCount") : null,
    season_wins: season ? intf(season, "totalWinCount") : null,
    season_losses: season ? intf(season, "totalLoseCount") : null,
    season_draws: season ? intf(season, "totalDrawCount") : null,
    season_winrate: season ? intf(season, "totalWinRate") : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // 로그인 게이트: 호출자 JWT 검증 (비로그인 차단)
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

  const row = await collect(ano);
  if (!row) return json({ error: "no record" }, 404);

  // service role 로 upsert (RLS 우회). 실패해도 최신값은 반환.
  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("player_record").upsert({ ...row, updated_at: new Date().toISOString() });
  } catch { /* 반환은 계속 */ }

  return json({ record: row });
});
