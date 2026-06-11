import { Link } from "react-router-dom";
import type { RecentGame } from "../lib/types";
import { gameTypeLabel } from "../lib/types";
import Hero from "./Hero";

function fmtDate(s: string): string {
  // date 가 "YYYY-MM-DD HH:MM:SS" 또는 ISO 문자열일 수 있음
  const t = s?.replace("T", " ").slice(0, 16);
  return t || s;
}

export default function RecentGames({ games }: { games: RecentGame[] }) {
  return (
    <div className="card">
      <h2>최근 경기 ({games.length})</h2>
      {games.length === 0 && <p className="muted">경기 기록 없음.</p>}
      <div className="game-list">
        {games.map((g) => {
          const result = g.is_win === null ? "draw" : g.is_win ? "win" : "loss";
          const label = g.is_win === null ? "무" : g.is_win ? "승" : "패";
          return (
            <Link
              key={g.gameID}
              to={`/game/${encodeURIComponent(g.gameID)}`}
              className={`game-row ${result}`}
            >
              <span className="g-result">{label}</span>
              <span className="g-type">{gameTypeLabel(g.roomType)}</span>
              <span className="g-hero"><Hero no={g.heroNo} size={26} /></span>
              <span className="g-rating muted">{g.averageRating ?? "-"}</span>
              <span className="g-date muted">{fmtDate(g.date)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
