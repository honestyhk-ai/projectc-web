import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { RankRow, RankSort } from "../lib/types";

const SORTS: { key: RankSort; label: string }[] = [
  { key: "wins", label: "승수" },
  { key: "winrate", label: "승률" },
  { key: "games", label: "경기수" },
];

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");

export default function Ranking() {
  const [sort, setSort] = useState<RankSort>("wins");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("ranking", { p_sort: sort });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as RankRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sort]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.nickname.toLowerCase().includes(term) || r.ano.toLowerCase() === term,
    );
  }, [rows, q]);

  const hi = (s: RankSort) => sort === s;

  return (
    <div className="page">
      <div className="rank-head">
        <h1>현재 순위</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          랭크 경기 전적 기준 · 참가자 {rows.length.toLocaleString()}명
        </span>
        <div className="seg-group">
          {SORTS.map((s) => (
            <button key={s.key} className={`seg ${hi(s.key) ? "on" : ""}`} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="searchbar" style={{ maxWidth: 360 }}>
        <input
          placeholder="닉네임 / 계정(ano) 으로 순위 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
              <th className="c">승</th>
              <th className="c">패</th>
              <th className="c">승률</th>
              <th className="c">경기</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ano} className={r.rnk <= 3 && !q ? "top3" : ""}>
                <td className="c rnk">{!q && medal(r.rnk)} {r.rnk}</td>
                <td>
                  <Link className="link" to={`/player/${encodeURIComponent(r.ano)}`}>
                    {r.nickname || "(닉 없음)"}
                  </Link>
                  <span className="ano muted"> {r.ano}</span>
                </td>
                <td className="c"><b style={{ color: "var(--win)" }}>{r.wins}</b></td>
                <td className="c muted">{r.losses}</td>
                <td className="c">{r.winrate}%</td>
                <td className="c muted">{r.games}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="center-text muted">
                  {q ? "검색 결과가 없습니다." : "순위 데이터가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
