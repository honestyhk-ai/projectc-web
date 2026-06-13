// 실시간 "지금 게임 중?" 프록시.
//   브라우저(HTTPS)는 게임 서버(http://...:8081)를 혼합콘텐츠로 직접 못 부르므로 이 Edge Function 이 중계.
//   흐름: 로그인 사용자 → invoke('live-game',{ano} 또는 {anos:[...]}) → ObserveGame.aspx 실시간 조회 → 매칭.
//     - { ano }       : 단건. 해당 ano 가 진행 중 게임에 있으면 그 게임 전체(양팀 10명) 반환.
//     - { anos: [...] }: 배치(검색결과용). 라이브인 ano 만 가벼운 요약으로 반환.
//   배포: supabase functions deploy live-game  (SUPABASE_URL/ANON_KEY 는 런타임 자동 주입)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OBSERVE = "http://www.chaosonline.co.kr:8081/ClientJson/ObserveGame.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

interface RawPlayer {
  ano: string;
  nickname: string;
  campType: string;
  heroNo: string;
  mvpOdds: string;
  isMvp: string;
}
interface RawGame {
  gameID: string;
  roomType: string;
  mapType: string;
  gameTime: string;
  averageRating: string;
  date: string;
  playerList: RawPlayer[];
}

// ObserveGame 은 비표준 JSON(키 따옴표 없음 + trailing comma) → 정규식으로 보정 후 파싱.
function parseObserve(raw: string): RawGame[] {
  const fixed = raw
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
  const data = JSON.parse(fixed);
  return (data.observeGameList ?? []) as RawGame[];
}

async function fetchObserve(): Promise<RawGame[] | null> {
  try {
    const r = await fetch(OBSERVE, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    return parseObserve(await r.text());
  } catch {
    return null;
  }
}

function gameSummary(g: RawGame) {
  return {
    gameID: g.gameID,
    roomType: g.roomType,
    mapType: g.mapType,
    gameTime: Number(g.gameTime) || 0,
    averageRating: g.averageRating,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // 로그인 게이트: 호출자 JWT 검증 (비로그인 차단) — refresh-record 와 동일 패턴.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { ano?: unknown; anos?: unknown } = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }

  const games = await fetchObserve();
  if (games == null) return json({ error: "observe unreachable" }, 502);

  // 배치 모드: 검색결과의 여러 ano 중 라이브인 것만.
  if (Array.isArray(body.anos)) {
    const want = new Set(body.anos.map((a) => String(a).trim()).filter((a) => /^\d+$/.test(a)));
    const liveAnos: Record<string, ReturnType<typeof gameSummary> & { campType: string; heroNo: string }> = {};
    for (const g of games) {
      for (const p of g.playerList ?? []) {
        if (want.has(p.ano) && !liveAnos[p.ano]) {
          liveAnos[p.ano] = { ...gameSummary(g), campType: p.campType, heroNo: p.heroNo };
        }
      }
    }
    return json({ liveAnos });
  }

  // 단건 모드: ano 가 속한 게임 전체(양팀 10명) 반환.
  const ano = String(body.ano ?? "").trim();
  if (!/^\d+$/.test(ano)) return json({ error: "bad ano" }, 400);
  for (const g of games) {
    const me = (g.playerList ?? []).find((p) => p.ano === ano);
    if (me) {
      return json({
        live: true,
        game: {
          ...gameSummary(g),
          players: (g.playerList ?? []).map((p) => ({
            ano: p.ano,
            nickname: p.nickname,
            campType: p.campType,
            heroNo: p.heroNo,
            mvpOdds: p.mvpOdds,
            isMvp: p.isMvp,
          })),
        },
      });
    }
  }
  return json({ live: false });
});
