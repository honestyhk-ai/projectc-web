import type { PlayerGrade } from "../lib/types";
import { gradeLabel } from "../lib/types";
import GradeBadge from "./GradeBadge";

// 게임 내 '내 정보'와 동일한 공식 현재 등급/점수/순위.
// 공식은 시즌 Top200 진입자만 공개 → 미진입 랭크 참가자는 '비공개' 안내, 랭크 미참가자는 카드 숨김.
// grade 는 Profile 에서 official_grade RPC 로 1회 조회해 전달(중복 fetch 방지).
export default function OfficialRank({ grade, rankedGames }: { grade: PlayerGrade | null; rankedGames: number }) {
  // 랭크 미참가자에겐 의미 없음 → 숨김
  if (!grade && rankedGames <= 0) return null;

  // 랭크는 했지만 Top200 밖 → 정직하게 비공개 안내
  if (!grade) {
    return (
      <div className="card official-rank">
        <h2>🏆 공식 랭킹</h2>
        <p className="muted" style={{ margin: 0 }}>
          시즌 Top200 밖 · 공식 등급 비공개
        </p>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          공식은 시즌 상위 200명만 등급/점수를 공개합니다.
        </p>
      </div>
    );
  }

  const seasonLabel = `${grade.season_year}년 ${grade.season_no}시즌`;

  return (
    <div className="card official-rank">
      <h2>
        🏆 공식 랭킹 <span className="muted" style={{ fontSize: 12 }}>{seasonLabel}</span>
      </h2>
      <div className="official-rank-top">
        <GradeBadge icon={grade.grade} text={gradeLabel(grade)} size={34} />
        <div className="official-rank-figures">
          {grade.official_rank != null && (
            <span className="orf">
              <b>{grade.official_rank.toLocaleString()}</b> 위
            </span>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="d-row">
          <span className="d-label muted">전적</span>
          <span className="d-value">
            {grade.wins}승 {grade.draws}무 {grade.losses}패
          </span>
        </div>
        <div className="d-row">
          <span className="d-label muted">승률</span>
          <span className="d-value">{grade.winrate != null ? `${grade.winrate}%` : "-"}</span>
        </div>
        <div className="d-row">
          <span className="d-label muted">경기수</span>
          <span className="d-value">{grade.games != null ? grade.games.toLocaleString() : "-"}</span>
        </div>
        <div className="d-row">
          <span className="d-label muted">평균 기여도</span>
          <span className="d-value">{grade.contribution != null ? grade.contribution.toLocaleString() : "-"}</span>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        공식 명예의 전당 기준 · {grade.snapshot_date ?? ""} 갱신
      </p>
    </div>
  );
}
