import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { HofRow } from "../lib/types";
import GradeBadge from "./GradeBadge";

// 게임 내 '내 정보'와 동일한 공식 명예의 전당 현재 값(등급/점수/순위/KDA/기여도).
// 공식이 Top200 진입자만 공개하므로 해당 계정이 없으면 카드 자체를 숨긴다.
export default function OfficialRank({ ano }: { ano: string }) {
  const [hof, setHof] = useState<HofRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("hall_of_fame_player", { p_ano: ano });
      if (cancelled) return;
      setHof(((data as HofRow[]) ?? [])[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  if (!hof) return null;

  const seasonLabel = `${hof.season_year}년 ${hof.season_no}시즌`;
  const rank = hof.live_rank ?? hof.rank;

  return (
    <div className="card official-rank">
      <h2>
        🏆 공식 랭킹 <span className="muted" style={{ fontSize: 12 }}>{seasonLabel}</span>
      </h2>
      <div className="official-rank-top">
        <GradeBadge icon={hof.live_grade ?? hof.grade_icon} text={hof.live_grade_name || hof.grade_text} size={34} />
        <div className="official-rank-figures">
          {hof.point != null && (
            <span className="orf">
              <b>{hof.point.toLocaleString()}</b> 점
            </span>
          )}
          {rank != null && (
            <span className="orf">
              <b>{rank.toLocaleString()}</b> 위
            </span>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="d-row">
          <span className="d-label muted">승률</span>
          <span className="d-value">{hof.winrate != null ? `${hof.winrate}%` : "-"}</span>
        </div>
        <div className="d-row">
          <span className="d-label muted">평균 KDA</span>
          <span className="d-value">{hof.kda ?? "-"}</span>
        </div>
        <div className="d-row">
          <span className="d-label muted">경기수</span>
          <span className="d-value">{hof.games != null ? hof.games.toLocaleString() : "-"}</span>
        </div>
        <div className="d-row">
          <span className="d-label muted">평균 기여도</span>
          <span className="d-value">{hof.contribution != null ? hof.contribution.toLocaleString() : "-"}</span>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        공식 명예의 전당(Top 200) 기준 · {hof.snapshot_date ?? ""} 갱신
      </p>
    </div>
  );
}
