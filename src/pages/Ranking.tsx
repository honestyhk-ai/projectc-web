import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { RankRow } from "../lib/types";

type Mode = "total" | "normal" | "ranked";
const MODES: { key: Mode; label: string }[] = [
  { key: "ranked", label: "랭크" },
  { key: "normal", label: "일반" },
  { key: "total", label: "전체" },
];
const MIN_OPTIONS = [30, 50, 100, 200];

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");

export default function Ranking() {
  const [mode, setMode] = useState<Mode>("ranked");
  const [minGames, setMinGames] = useState(50);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("ranking", {
        p_mode: mode,
        p_min_games: minGames,
        p_limit: 100,
      });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as RankRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, minGames]);

  return (
    <div className="page">
      <div className="rank-head">
        <h1>현재 순위</h1>
        <div className="seg-group">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`seg ${mode === m.key ? "on" : ""}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="seg-group">
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>최소</span>
          {MIN_OPTIONS.map((n) => (
            <button
              key={n}
              className={`seg ${minGames === n ? "on" : ""}`}
              onClick={() => setMinGames(n)}
            >
              {n}판
            </button>
          ))}
        </div>
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
              <th className="c">승률</th>
              <th className="c">전적 (승-무-패)</th>
              <th className="c">게임</th>
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
                  <b className="winrate">{r.winrate}%</b>
                </td>
                <td className="c muted">
                  {r.wins}-{r.draws}-{r.losses}
                </td>
                <td className="c muted">{r.games}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="center-text muted">
                  조건에 맞는 플레이어가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
