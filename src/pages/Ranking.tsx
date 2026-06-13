import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { SeasonRankRow } from "../lib/types";
import GradeBadge from "../components/GradeBadge";

const PAGE_SIZE = 50;
const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");

export default function Ranking() {
  const [rows, setRows] = useState<SeasonRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // RPC 미생성/수집대기 중이어도 에러 없이 빈 목록 → "수집 대기" 안내.
      const { data } = await supabase.rpc("season_ranking");
      if (cancelled) return;
      setRows((data as SeasonRankRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 검색 바뀌면 첫 페이지로
  useEffect(() => {
    setPage(1);
  }, [q]);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () => rows.filter((r) => !term || r.nickname.toLowerCase().includes(term) || r.ano.toLowerCase() === term),
    [rows, term],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const pageRows = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  // 페이지 버튼: 처음/끝 + 현재 ±4
  const pages = useMemo(() => {
    const set = new Set<number>([1, totalPages]);
    for (let i = cur - 4; i <= cur + 4; i++) if (i >= 1 && i <= totalPages) set.add(i);
    return [...set].sort((a, b) => a - b);
  }, [cur, totalPages]);

  return (
    <div className="page">
      <div className="rank-head">
        <h1>이번 시즌 랭킹대전 순위</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          이번 시즌 랭크 참가자 {rows.length.toLocaleString()}명 · 클라이언트 전투 평점(rating) 순
        </span>
      </div>

      <div className="rank-section-head">
        <div className="searchbar" style={{ maxWidth: 360 }}>
          <input
            placeholder="닉네임 / 계정(ano) 으로 순위 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <>
          <table className="rank-table">
            <thead>
              <tr>
                <th className="c">#</th>
                <th>티어</th>
                <th>플레이어</th>
                <th className="c">평점</th>
                <th className="c">승</th>
                <th className="c">패</th>
                <th className="c">승률</th>
                <th className="c">경기</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.ano} className={r.rnk <= 3 && !q ? "top3" : ""}>
                  <td className="c rnk">
                    {!q && medal(r.rnk)} {r.rnk}
                  </td>
                  <td>
                    <GradeBadge icon={r.grade} text={r.grade_name} showText={false} />
                  </td>
                  <td>
                    <Link className="link" to={`/player/${encodeURIComponent(r.ano)}`}>
                      {r.nickname || "(닉 없음)"}
                    </Link>
                    <span className="ano muted"> {r.ano}</span>
                  </td>
                  <td className="c">
                    <b>{r.rating}</b>
                  </td>
                  <td className="c">
                    <b style={{ color: "var(--win)" }}>{r.wins}</b>
                  </td>
                  <td className="c muted">{r.losses}</td>
                  <td className="c">{r.winrate}%</td>
                  <td className="c muted">{r.games}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="center-text muted">
                    {q ? "검색 결과가 없습니다." : "이번 시즌 랭크 데이터가 없습니다. (수집 대기)"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pager">
              <button className="seg" disabled={cur === 1} onClick={() => setPage(cur - 1)}>
                ‹
              </button>
              {pages.map((p, i) => (
                <span key={p} className="pager-item">
                  {i > 0 && pages[i - 1] !== p - 1 && <span className="pager-gap">…</span>}
                  <button className={`seg ${p === cur ? "on" : ""}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                </span>
              ))}
              <button className="seg" disabled={cur === totalPages} onClick={() => setPage(cur + 1)}>
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
