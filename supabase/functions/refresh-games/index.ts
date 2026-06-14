// 온디맨드 "최근 게임" 새로고침 — 원본(wqlav)에서 그 선수 최근 경기를 직접 읽어 반환.
//   최근 게임은 평소 30분 sync 로만 갱신되는데, 이 함수는 wqlav 를 즉시 조회해 방금 한 게임까지 보여줌.
//   ⚠️ 메인 game/game_player 에 쓰지 않음(써넣으면 sync 워터마크가 꼬여 다른 경기 누락) → 읽어서 바로 반환만.
//   필요 시크릿: WQLAV_DB_URL (Supabase Edge secret). 배포: npx supabase functions deploy refresh-games --project-ref lcmqltmztcklyptibqvi
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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
  let limit = 30;
  try {
    const body = await req.json();
    ano = String(body.ano ?? "").trim();
    if (body.limit) limit = Math.min(100, Math.max(1, parseInt(String(body.limit), 10) || 30));
  } catch { /* ignore */ }
  if (!/^\d+$/.test(ano)) return json({ error: "bad ano" }, 400);

  const WQLAV = (Deno.env.get("WQLAV_DB_URL") || "").split("?")[0];
  if (!WQLAV) return json({ error: "WQLAV_DB_URL 미설정" }, 500);

  const sql = postgres(WQLAV, { ssl: { rejectUnauthorized: false }, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    const games = await sql`
      select g."gameID", g.date, g."roomType", g."averageRating",
             gp."heroNo", gp."campType", gp."mvpOdds",
             g."winnerTeam", g."gameTime", g."liveType",
             case
               when g."winnerTeam" in ('', 'N') then null
               when (gp."campType" = '0' and g."winnerTeam" = 'E')
                 or (gp."campType" = '1' and g."winnerTeam" = 'U') then true
               else false
             end as is_win
      from game_player gp
      join game g on gp."gameID" = g."gameID"
      where gp.ano = ${ano}
      order by g.date desc
      limit ${limit}
    `;
    return json({ ano, games });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "query failed" }, 502);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
