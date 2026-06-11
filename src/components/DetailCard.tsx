import type { PlayerOverview, WinrateSummary } from "../lib/types";

function row(label: string, value: React.ReactNode) {
  return (
    <div className="d-row">
      <span className="d-label muted">{label}</span>
      <span className="d-value">{value}</span>
    </div>
  );
}

export default function DetailCard({
  ano,
  overview,
  summary,
}: {
  ano: string;
  overview: PlayerOverview | null;
  summary: WinrateSummary | null;
}) {
  return (
    <div className="card">
      <h2>상세 정보</h2>
      <div className="detail-grid">
        {row("계정 (ano)", ano)}
        {row("전체 게임", overview ? overview.total_games.toLocaleString() : "-")}
        {row("랭크 전적", summary ? `${summary.ranked_wins}승 ${summary.ranked_draws}무 ${Math.max(0, summary.ranked_games - summary.ranked_wins - summary.ranked_draws)}패` : "-")}
        {row("일반 전적", summary ? `${summary.normal_wins}승 ${summary.normal_draws}무 ${Math.max(0, summary.normal_games - summary.normal_wins - summary.normal_draws)}패` : "-")}
        {row("사용 IP", overview ? `${overview.ip_count}개` : "-")}
        {row("첫 게임", overview?.first_seen?.slice(0, 10) ?? "-")}
        {row("마지막 게임", overview?.last_seen?.slice(0, 16) ?? "-")}
      </div>
    </div>
  );
}
