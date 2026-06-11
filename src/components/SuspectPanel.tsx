import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { SuspectRow } from "../lib/types";
import { scoreClass } from "../lib/types";

const SIGNAL_LABELS: Record<string, string> = {
  ip_overlap_score: "IP중복",
  hourly_corr: "시간대",
  game_type_sim: "게임유형",
  co_ratio_score: "동시플레이",
  hero_sim: "영웅",
  timing_score: "활동기간",
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function SuspectPanel({ ano }: { ano: string }) {
  const [rows, setRows] = useState<SuspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc("player_suspects", { p_ano: ano });
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((data as SuspectRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  return (
    <div className="card">
      <h2>
        의심 부계정{" "}
        <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
          (IP·시간대·게임유형·동시플레이 종합 점수, 0.65↑만)
        </span>
      </h2>
      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <p className="muted">의심되는 부계정 쌍이 없습니다.</p>
      ) : (
        <div className="suspect-list">
          {rows.map((r) => (
            <div key={r.other_ano} className="suspect-row">
              <div className="suspect-head">
                <span className={`score score-${scoreClass(r.identity_score)}`}>
                  {pct(r.identity_score)}
                </span>
                <Link className="link suspect-nick" to={`/player/${encodeURIComponent(r.other_ano)}`}>
                  {r.other_nick || "(닉 없음)"}
                </Link>
                <span className="muted ano">{r.other_ano}</span>
                <span className="muted suspect-meta">
                  공유IP {r.shared_ip_count} · 상대 {r.game_count_other}게임
                  {r.timing_overlap ? " · 동시접속" : ""}
                </span>
              </div>
              {r.signal_details && (
                <div className="signals">
                  {Object.entries(SIGNAL_LABELS)
                    .filter(([k]) => r.signal_details![k] != null)
                    .map(([k, label]) => (
                      <span key={k} className="sig">
                        {label} <b>{pct(r.signal_details![k])}</b>
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
