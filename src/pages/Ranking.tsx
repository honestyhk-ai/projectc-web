import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { HofRow, RankRow, RankSort } from "../lib/types";
import GradeBadge from "../components/GradeBadge";
import Hero from "../components/Hero";

const SORTS: { key: RankSort; label: string }[] = [
  { key: "wins", label: "승수" },
  { key: "winrate", label: "승률" },
  { key: "games", label: "경기수" },
];

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");

const changeClass = (c: string) =>
  c.startsWith("▲") || c === "NEW" ? "up" : c.startsWith("▼") ? "down" : "same";

export default function Ranking() {
  const [sort, setSort] = useState<RankSort>("wins");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [hof, setHof] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // 명예의 전당은 정렬/검색과 무관하게 1회 로드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("hall_of_fame_current");
      if (cancelled) return;
      if (error) setErr(error.message);
      setHof((data as HofRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const term = q.trim().toLowerCase();
  const match = (nickname: string, ano: string) =>
    !term || nickname.toLowerCase().includes(term) || ano.toLowerCase() === term;

  const hofAnos = useMemo(() => new Set(hof.map((h) => h.ano)), [hof]);
  const hofFiltered = useMemo(() => hof.filter((h) => match(h.nickname, h.ano)), [hof, term]);
  // 하단 실측 순위는 명예의 전당(상위 100)에 든 계정 제외
  const restFiltered = useMemo(
    () => rows.filter((r) => !hofAnos.has(r.ano) && match(r.nickname, r.ano)),
    [rows, hofAnos, term],
  );

  const hi = (s: RankSort) => sort === s;
  const seasonLabel = hof[0] ? `${hof[0].season_year}년 ${hof[0].season_no}시즌` : "";

  return (
    <div className="page">
      <div className="rank-head">
        <h1>현재 순위</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          공식 명예의 전당(상위 100) + 전체 랭크 참가자 {rows.length.toLocaleString()}명
        </span>
      </div>

      <div className="searchbar" style={{ maxWidth: 360 }}>
        <input
          placeholder="닉네임 / 계정(ano) 으로 순위 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {err && <div className="error">{err}</div>}

      {/* ── 공식 명예의 전당 (상위 100, 티어) ── */}
      <section className="rank-section">
        <h2 className="rank-section-title">
          🏆 명예의 전당 <span className="muted">{seasonLabel} · 공식 상위 100</span>
        </h2>
        {hof.length === 0 ? (
          <div className="muted">명예의 전당 데이터가 아직 없습니다. (수집 대기)</div>
        ) : (
          <table className="rank-table hof-table">
            <thead>
              <tr>
                <th className="c">#</th>
                <th>티어</th>
                <th className="c">점수</th>
                <th>플레이어</th>
                <th className="c">승률</th>
                <th className="c">KDA</th>
                <th className="c">경기</th>
                <th className="c">평균기여도</th>
                <th className="c">대표영웅</th>
              </tr>
            </thead>
            <tbody>
              {hofFiltered.map((h) => (
                <tr key={h.ano} className={h.rank <= 3 && !q ? "top3" : ""}>
                  <td className="c rnk">
                    {!q && medal(h.rank)} {h.rank}
                    {h.season_change && h.season_change !== "-" && (
                      <span className={`rank-change ${changeClass(h.season_change)}`}>{h.season_change}</span>
                    )}
                  </td>
                  <td>
                    <GradeBadge
                      icon={h.live_grade ?? h.grade_icon}
                      text={h.live_grade_name || h.grade_text}
                    />
                  </td>
                  <td className="c">{h.point != null ? <b>{h.point.toLocaleString()}</b> : "-"}</td>
                  <td>
                    <Link className="link" to={`/player/${encodeURIComponent(h.ano)}`}>
                      {h.nickname || "(닉 없음)"}
                    </Link>
                    <span className="ano muted"> {h.ano}</span>
                  </td>
                  <td className="c">{h.winrate != null ? `${h.winrate}%` : "-"}</td>
                  <td className="c">{h.kda ?? "-"}</td>
                  <td className="c muted">{h.games ?? "-"}</td>
                  <td className="c muted">{h.contribution != null ? h.contribution.toLocaleString() : "-"}</td>
                  <td className="c">
                    <span className="rep-heroes">
                      {h.hero1 && <Hero no={h.hero1} size={26} />}
                      {h.hero2 && <Hero no={h.hero2} size={26} />}
                    </span>
                  </td>
                </tr>
              ))}
              {hofFiltered.length === 0 && (
                <tr>
                  <td colSpan={9} className="center-text muted">검색 결과가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 100위 밖 전체 참가자 (자체 실측 통계) ── */}
      <section className="rank-section">
        <div className="rank-section-head">
          <h2 className="rank-section-title">
            전체 참가자 <span className="muted">100위 밖 · 자체 실측 통계</span>
          </h2>
          <div className="seg-group">
            {SORTS.map((s) => (
              <button key={s.key} className={`seg ${hi(s.key) ? "on" : ""}`} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
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
              {restFiltered.map((r) => (
                <tr key={r.ano}>
                  <td className="c rnk">{r.rnk}</td>
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
              {restFiltered.length === 0 && (
                <tr>
                  <td colSpan={6} className="center-text muted">
                    {q ? "검색 결과가 없습니다." : "순위 데이터가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
