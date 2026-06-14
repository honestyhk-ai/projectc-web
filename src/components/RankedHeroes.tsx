import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { RankedHeroRow } from "../lib/types";
import { heroName } from "../lib/heroNames";
import Hero from "./Hero";

// 랭킹대전 영웅(공식 전체시즌). 우리 game_player 표본이 아니라 공식 서버 RecordInfo 기준이라
// 영웅별 게임수 합계가 공식 '랭킹대전 총전적'과 맞는다.
//   - 먼저 캐시(player_ranked_heroes RPC) 조회. 있으면 표시.
//   - 없으면 버튼으로 ranked-heroes 엣지함수 호출(영웅 112종 조회 ~수초) → 채우고 표시.
export default function RankedHeroes({ ano }: { ano: string }) {
  const [rows, setRows] = useState<RankedHeroRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("player_ranked_heroes", { p_ano: ano });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as RankedHeroRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  async function fetchOfficial() {
    if (fetching) return;
    setFetching(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("ranked-heroes", { body: { ano } });
      if (error) throw error;
      const heroes = (data as { heroes?: RankedHeroRow[] } | null)?.heroes ?? [];
      // 엣지함수는 winrate 미포함 → 계산 보강.
      setRows(
        heroes.map((h) => ({
          ...h,
          winrate: h.games > 0 ? Math.round((1000 * h.wins) / h.games) / 10 : null,
        })),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setFetching(false);
    }
  }

  const total = (rows ?? []).reduce((s, h) => s + (h.games ?? 0), 0);
  const shown = showAll ? rows ?? [] : (rows ?? []).slice(0, 12);

  return (
    <div className="card">
      <h2>
        랭킹대전 영웅{rows && rows.length > 0 ? ` (${rows.length}종 · ${total.toLocaleString()}전)` : ""}
      </h2>
      <p className="muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>
        공식 서버 기준 <b>전체 시즌 랭킹대전</b> 영웅별 전적입니다(수집 표본 아님).
      </p>
      {err && <div className="error">{err}</div>}

      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : !rows || rows.length === 0 ? (
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            {fetching ? "공식 서버에서 영웅별 랭크 전적을 모으는 중… (수초 소요)" : "아직 수집되지 않았습니다."}
          </p>
          <button className="back-btn" onClick={fetchOfficial} disabled={fetching} style={{ marginTop: 4 }}>
            {fetching ? "불러오는 중…" : "공식 랭크 영웅 불러오기"}
          </button>
        </div>
      ) : (
        <>
          <table className="hero-table">
            <thead>
              <tr>
                <th>영웅</th>
                <th className="c">게임</th>
                <th className="c">승 / 패</th>
                <th className="c">승률</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((h) => (
                <tr key={h.hero_no}>
                  <td className="hcell">
                    <Hero no={h.hero_no} size={30} />
                    <span className="hname">{heroName(h.hero_no)}</span>
                  </td>
                  <td className="c">{h.games}</td>
                  <td className="c muted">
                    {h.wins} / {h.losses}
                  </td>
                  <td className="c">
                    <span className="hwr" data-hi={(h.winrate ?? 0) >= 50}>
                      {h.winrate ?? "-"}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && (
            <button className="link more-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "접기" : `+ ${rows.length - 12}종 더 보기`}
            </button>
          )}
          <button className="link more-btn" onClick={fetchOfficial} disabled={fetching} style={{ marginLeft: 12 }}>
            {fetching ? "갱신 중…" : "↻ 갱신"}
          </button>
        </>
      )}
    </div>
  );
}
