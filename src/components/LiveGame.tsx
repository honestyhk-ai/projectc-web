import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLiveGame, elapsedLabel } from "../lib/liveGame";
import { gameTypeLabel, FACTION } from "../lib/types";
import type { LiveGameData, LivePlayer } from "../lib/types";
import { heroName } from "../lib/heroNames";
import Hero from "./Hero";

// 프로필: 이 플레이어가 지금 게임 중이면 현재 매치(양팀 10명)를 보여줌.
//   라이브가 아니거나 프록시 미배포/8081 미도달이면 아무것도 렌더하지 않음(조용히 숨김).
export default function LiveGame({ ano }: { ano: string }) {
  const [game, setGame] = useState<LiveGameData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLiveGame(ano).then((g) => {
      if (!cancelled) {
        setGame(g);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ano]);

  if (loading || !game) return null;

  const teams: Array<["0" | "1", LivePlayer[]]> = [
    ["0", game.players.filter((p) => p.campType === "0")],
    ["1", game.players.filter((p) => p.campType === "1")],
  ];

  return (
    <div className="card live-card">
      <h2>
        <span className="live-dot" /> 지금 게임 중
        <span className="muted live-meta">
          {gameTypeLabel(game.roomType)} · {elapsedLabel(game.gameTime)} 경과
        </span>
      </h2>
      <div className="live-teams">
        {teams.map(([camp, players]) => (
          <div key={camp} className={`live-team ${camp === "0" ? "holy" : "undead"}`}>
            <div className="live-team-title">{FACTION[camp]}</div>
            {players.map((p) => (
              <Link
                key={p.ano}
                to={`/player/${encodeURIComponent(p.ano)}`}
                className={`live-player ${p.ano === ano ? "self" : ""}`}
              >
                <Hero no={p.heroNo} size={24} />
                <span className="lp-hero">{heroName(p.heroNo)}</span>
                <span className="lp-nick">{p.nickname || "(닉 없음)"}</span>
                {p.isMvp === "1" && <span className="lp-mvp">MVP</span>}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
