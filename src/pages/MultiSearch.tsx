import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { winRate, gradeLabel } from "../lib/types";
import type { MultiSearchRow } from "../lib/types";
import GradeBadge from "../components/GradeBadge";
import Hero from "../components/Hero";

// op.gg 멀티서치: 영웅선택창 닉을 줄바꿈/콤마로 여러 개 붙여넣으면 팀원 전적·주력영웅을 한 화면에.
// 게임 클라를 전혀 건드리지 않으므로(안티치트 무관) 닉 입력은 수동(복붙).
const MAX_NICKS = 10;

function parseNicks(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\n,]/)) {
    const n = tok.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= MAX_NICKS) break;
  }
  return out;
}

function streakLabel(s: number | null): { text: string; cls: string } | null {
  if (s == null || s === 0) return null;
  return s > 0
    ? { text: `🔥 ${s}연승`, cls: "win" }
    : { text: `❄️ ${-s}연패`, cls: "loss" };
}

// player_record(공식 RecordInfo) 우선, 없으면 player_winrate_summary 로 폴백.
function seasonStat(r: MultiSearchRow): { games: number; winrate: number } | null {
  if ((r.season_games ?? 0) > 0)
    return { games: r.season_games!, winrate: r.season_winrate ?? winRate(r.season_wins ?? 0, r.season_games!) };
  if ((r.sum_ranked_games ?? 0) > 0)
    return { games: r.sum_ranked_games!, winrate: winRate(r.sum_ranked_wins ?? 0, r.sum_ranked_games!) };
  return null;
}
function careerStat(r: MultiSearchRow): { games: number; winrate: number } | null {
  if ((r.career_games ?? 0) > 0)
    return { games: r.career_games!, winrate: winRate(r.career_wins ?? 0, r.career_games!) };
  if ((r.sum_total_games ?? 0) > 0)
    return { games: r.sum_total_games!, winrate: winRate(r.sum_total_wins ?? 0, r.sum_total_games!) };
  return null;
}

export default function MultiSearch() {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<MultiSearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const nicks = parseNicks(raw);
    if (nicks.length === 0) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("multi_search", { p_nicks: nicks });
    setBusy(false);
    setSearched(true);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data as MultiSearchRow[]) ?? []);
  }

  // 결과 화면에서 다시 검색: 입력은 유지하고 결과만 비워 검색창으로 복귀.
  function reset() {
    setRows([]);
    setSearched(false);
    setErr(null);
  }

  const showResults = rows.length > 0;

  return (
    <div className="page">
      {showResults ? (
        <div className="multi-back">
          <button type="button" className="back-btn" onClick={reset}>← 다시 검색</button>
        </div>
      ) : (
        <form className="multi-form" onSubmit={onSearch}>
          <textarea
            className="multi-input"
            placeholder={"닉네임을 줄바꿈 또는 콤마로 구분해 붙여넣으세요 (최대 10명)\n예)\n태블릿\nroosee, 세월"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            autoFocus
          />
          <button type="submit" disabled={busy}>
            {busy ? "조회 중…" : "전적 비교"}
          </button>
        </form>
      )}

      {err && <div className="error">{err}</div>}

      {rows.length > 0 && (
        <div className="multi-table-wrap">
          <table className="multi-table">
            <thead>
              <tr>
                <th>플레이어</th>
                <th>등급</th>
                <th>이번 시즌(랭크)</th>
                <th>통산</th>
                <th>평균 K/A · 평점</th>
                <th>주력 영웅</th>
                <th>연속</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                if (!r.found || !r.ano) {
                  return (
                    <tr key={r.idx} className="multi-row notfound">
                      <td><span className="nick">{r.input_nick}</span></td>
                      <td colSpan={6} className="muted">기록 없음</td>
                    </tr>
                  );
                }
                const ssn = seasonStat(r);
                const car = careerStat(r);
                const heroes = (r.top_heroes ?? []).slice(0, 6);
                const st = streakLabel(r.streak);
                return (
                  <tr key={r.idx} className="multi-row">
                    <td>
                      <Link className="nick-link" to={`/player/${encodeURIComponent(r.ano)}`}>
                        {r.nickname || r.input_nick}
                      </Link>
                      {r.official_rank != null && (
                        <span className="rank-chip" title="공식 Top200 순위">🏅 {r.official_rank}위</span>
                      )}
                    </td>
                    <td>
                      {r.grade_name ? (
                        <GradeBadge icon={r.grade} text={gradeLabel({ grade_name: r.grade_name, point: r.point })} size={26} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {ssn ? (
                        <><b className="wr">{ssn.winrate}%</b><span className="muted"> · {ssn.games}판</span></>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {car ? (
                        <><b className="wr">{car.winrate}%</b><span className="muted"> · {car.games}판</span></>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.kill_avg != null ? (
                        <>
                          {r.kill_avg.toFixed(1)} / {(r.assist_avg ?? 0).toFixed(1)}
                          {r.combat_rate_avg != null && (
                            <span className="muted"> · {r.combat_rate_avg.toFixed(1)}</span>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="hero-cell">
                      {heroes.length > 0 ? (
                        <div className="hero-icons">
                          {heroes.map((no) => (
                            <span key={no} className="hero-ico">
                              <Hero no={no} size={40} />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {st ? <span className={`streak ${st.cls}`}>{st.text}</span> : <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {searched && !busy && rows.length === 0 && !err && (
        <div className="muted center-text">조회 결과가 없습니다.</div>
      )}
    </div>
  );
}
