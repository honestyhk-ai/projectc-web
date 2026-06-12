import type { PlayerGrade, PlayerRecord } from "../lib/types";
import { gradeLabel } from "../lib/types";
import GradeBadge from "./GradeBadge";

// 공식 현재 등급/점수/순위.
//   grade(player_grade, HallOfFame): 시즌 Top200 진입자 → 점수·순위까지.
//   rec(player_record, 클라이언트 RecordInfo): 모든 플레이어 → 세부 등급(점수/순위는 없음).
//   둘 다 없고 랭크 미참가면 카드 숨김.
export default function OfficialRank({
  grade,
  rec,
  rankedGames,
}: {
  grade: PlayerGrade | null;
  rec: PlayerRecord | null;
  rankedGames: number;
}) {
  // Top200 진입자: 점수·순위 포함 전체 카드
  if (grade) {
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
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          공식 명예의 전당(Top 200) 기준 · {grade.snapshot_date ?? ""} 갱신
        </p>
      </div>
    );
  }

  // Top200 밖이라도 RecordInfo 로 세부 등급은 표시 (점수/순위는 비공개)
  if (rec && rec.grade_name) {
    return (
      <div className="card official-rank">
        <h2>🏆 공식 등급</h2>
        <div className="official-rank-top">
          <GradeBadge icon={rec.grade} text={rec.grade_name} size={34} />
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          점수·공식 순위는 시즌 Top200 진입자만 공개됩니다.
        </p>
      </div>
    );
  }

  // 등급 정보 없음 — 랭크 미참가면 숨김
  if (rankedGames <= 0) return null;
  return null;
}
