import type { WinrateSummary } from "../lib/types";
import { winRate } from "../lib/types";

function Bar({ label, wins, draws, games }: { label: string; wins: number; draws: number; games: number }) {
  const losses = Math.max(0, games - wins - draws);
  const rate = winRate(wins, games);
  return (
    <div className="wr-row">
      <div className="wr-head">
        <span className="wr-label">{label}</span>
        <span className="wr-games muted">{games}전</span>
        <span className="wr-rate" data-high={rate >= 50}>
          {rate}%
        </span>
      </div>
      <div className="wr-bar">
        <span className="seg win" style={{ flex: wins }} title={`${wins}승`} />
        <span className="seg draw" style={{ flex: draws }} title={`${draws}무`} />
        <span className="seg loss" style={{ flex: losses }} title={`${losses}패`} />
      </div>
      <div className="wr-wld muted">
        {wins}승 {draws}무 {losses}패
      </div>
    </div>
  );
}

export default function WinRateCard({ s }: { s: WinrateSummary | null }) {
  if (!s) {
    return (
      <div className="card">
        <h2>승률</h2>
        <p className="muted">집계 데이터 없음 (player_winrate_summary 미반영).</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>승률</h2>
      <Bar label="전체" wins={s.total_wins} draws={s.draws} games={s.total_games} />
      <Bar label="일반" wins={s.normal_wins} draws={s.normal_draws} games={s.normal_games} />
      <Bar label="랭크" wins={s.ranked_wins} draws={s.ranked_draws} games={s.ranked_games} />
    </div>
  );
}
