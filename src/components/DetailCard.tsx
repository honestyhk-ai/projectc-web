import type { NickHistoryRow, PlayerGrade, WinrateSummary, HofRow } from "../lib/types";

function row(label: string, value: React.ReactNode, hint?: string) {
  return (
    <div className="d-row" title={hint}>
      <span className="d-label muted">{label}</span>
      <span className="d-value">{value}</span>
    </div>
  );
}

// 승/무/패 포맷. games·wins·draws 로 패는 역산.
function record(games?: number, wins?: number, draws?: number): string {
  if (games == null || wins == null) return "-";
  const d = draws ?? 0;
  const losses = Math.max(0, games - wins - d);
  const wr = games ? Math.round((1000 * wins) / games) / 10 : 0;
  return `${wins}승 ${d}무 ${losses}패 (${wr}%)`;
}

export default function DetailCard({
  ano,
  nicks,
  summary,
  grade,
  hof,
}: {
  ano: string;
  nicks: NickHistoryRow[];
  summary: WinrateSummary | null;
  grade: PlayerGrade | null; // 공식 현재 등급(Top200 진입자만)
  hof: HofRow | null; // 공식 명예의 전당 Top100(평균 KDA 출처)
}) {
  const latestNick = nicks.length ? nicks[nicks.length - 1].nickname : "";
  // 전닉(현재 제외) 중 최근 사용 2개
  const prevNicks = nicks
    .slice(0, -1)
    .slice()
    .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
    .slice(0, 2)
    .map((n) => n.nickname);

  const rankedGames = summary?.ranked_games ?? 0;
  // 시즌전적: 공식 현재 시즌(Top200 진입자만). 그 밖은 비공개.
  const seasonRec =
    grade != null
      ? record(grade.games, grade.wins, grade.draws)
      : rankedGames > 0
        ? "공식 미진입 (시즌 Top200 밖)"
        : "랭크 미참가";
  // 기여도/ KDA 도 공식 진입자만.
  const contribution = grade?.contribution != null ? `${grade.contribution.toLocaleString()} (평균)` : "공식 미진입";
  const kda = hof?.kda != null ? String(hof.kda) : "공식 미진입";

  return (
    <div className="card">
      <h2>상세 정보</h2>
      <div className="detail-grid">
        {row("닉네임", latestNick || "-")}
        {row("전 닉네임", prevNicks.length ? prevNicks.join(", ") : "-", "현재 제외 최근 2개")}
        {row("계정번호", ano)}
        {row("전체 총전적", summary ? record(summary.total_games, summary.total_wins, summary.draws) : "-")}
        {row(
          "랭킹대전 총전적",
          summary ? record(summary.ranked_games, summary.ranked_wins, summary.ranked_draws) : "-",
        )}
        {row("시즌 전적", seasonRec, "공식 현재 시즌 랭크 전적 (Top200만 공개)")}
        {row("기여도", contribution, "공식 평균 기여도 (Top200만 공개)")}
        {row("평균 KDA", kda, "공식 명예의 전당 Top100만 공개")}
        {row("평균 디스펠", "공개 데이터 없음", "게임 내부 전용 값 — 어떤 공개 출처에도 없음")}
        {row("평균 포션", "공개 데이터 없음", "게임 내부 전용 값 — 어떤 공개 출처에도 없음")}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        시즌전적·기여도·KDA 는 공식 명예의 전당(시즌 상위권)만 공개됩니다. 디스펠·포션은 게임 내부 전용 값이라 공개 데이터가 없습니다.
      </p>
    </div>
  );
}
