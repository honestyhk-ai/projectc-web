import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { HeroStat } from "../lib/types";
import { heroName } from "../lib/heroNames";
import Hero from "./Hero";

export default function HeroStats({ ano }: { ano: string }) {
  const [rows, setRows] = useState<HeroStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("player_heroes", { p_ano: ano });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as HeroStat[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  const shown = showAll ? rows : rows.slice(0, 12);
  const collected = rows.reduce((s, h) => s + (h.games ?? 0), 0);

  return (
    <div className="card">
      <h2>주력 영웅 ({rows.length}종 · 수집 {collected.toLocaleString()}경기)</h2>
      {rows.length > 0 && (
        <p className="muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          ※ 영웅별 수치는 사이트가 <b>수집한 경기 표본</b> 기준이라, 공식 서버의 <b>총전적</b>(상세 정보)보다 적습니다.
        </p>
      )}
      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <p className="muted">기록 없음.</p>
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
        </>
      )}
    </div>
  );
}
