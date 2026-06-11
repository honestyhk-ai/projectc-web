import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { RankRow } from "../lib/types";

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");

export default function Ranking() {
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("ranking", { p_limit: 100 });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as RankRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="rank-head">
        <h1>현재 순위</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          랭크 경기 결과로 산출한 MMR(Elo) 기준 · Top 100
        </span>
      </div>

      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <table className="rank-table">
          <thead>
            <tr>
              <th className="c">#</th>
              <th>플레이어</th>
              <th className="c">MMR</th>
              <th className="c">승률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ano} className={r.rnk <= 3 ? "top3" : ""}>
                <td className="c rnk">{medal(r.rnk)} {r.rnk}</td>
                <td>
                  <Link className="link" to={`/player/${encodeURIComponent(r.ano)}`}>
                    {r.nickname || "(닉 없음)"}
                  </Link>
                  <span className="ano muted"> {r.ano}</span>
                </td>
                <td className="c">
                  <b className="mmr">{r.mmr}</b>
                </td>
                <td className="c muted">{r.winrate}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="center-text muted">
                  순위 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
