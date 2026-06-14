import { Link } from "react-router-dom";
import type { RecentGame, GameResult } from "../lib/types";
import { gameTypeLabel, campResult } from "../lib/types";
import Hero from "./Hero";

// 결과 -> 한글 라벨. unknown(승자 미기록)은 "미정".
// 주의: liveType=1 은 "긁힐 당시 라이브"였다는 흔적일 뿐(끝난 게임도 그대로 남음) →
//       현재 진행중 여부로 신뢰할 수 없으므로 "진행" 라벨은 쓰지 않는다.
function resultLabel(r: GameResult): string {
  if (r === "win") return "승";
  if (r === "loss") return "패";
  if (r === "draw") return "무";
  return "미정";
}

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
          // is_win(RPC) 대신 winnerTeam+campType 로 직접 판정 — 빈값을 무승부로 오판하지 않음.
          const result = campResult(g.campType, g.winnerTeam);
          const label = resultLabel(result);
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
