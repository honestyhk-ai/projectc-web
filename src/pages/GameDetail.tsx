import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { GameRow, GamePlayerRow } from "../lib/types";
import { gameTypeLabel, teamLabel, winnerTeamLabel, CAMP_WIN, FACTION_SIDE } from "../lib/types";
import Hero from "../components/Hero";

export default function GameDetail() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const [g, gp] = await Promise.all([
        supabase
          .from("game")
          .select('gameID,date,roomType,mapType,ruleType,gameTime,title,winnerTeam,averageRating,liveType')
          .eq("gameID", gameId)
          .maybeSingle(),
        supabase
          .from("game_player")
          .select('gameID,ano,nickname,campType,heroNo,mvpOdds')
          .eq("gameID", gameId),
      ]);
      if (cancelled) return;
      if (g.error || gp.error) setErr((g.error || gp.error)!.message);
      setGame((g.data as GameRow) ?? null);
      setPlayers((gp.data as GamePlayerRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // campType 별로 묶기
  const camps = Array.from(new Set(players.map((p) => p.campType))).sort();

  return (
    <div className="page">
      <div className="detail-head">
        <button className="back-btn" onClick={() => navigate(-1)}>← 뒤로</button>
        <h1>경기 {gameId}</h1>
      </div>
      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <>
          {game && (
            <div className="card">
              <div className="kv">
                <span>유형</span> <b>{gameTypeLabel(game.roomType)}</b>
                <span>일시</span> <b>{game.date}</b>
                <span>승리팀</span> <b>{winnerTeamLabel(game.winnerTeam)}</b>
                <span>맵</span> <b>{game.mapType ?? "-"}</b>
                <span>평균레이팅</span> <b>{game.averageRating ?? "-"}</b>
                <span>게임시간</span> <b>{game.gameTime ?? "-"}</b>
              </div>
            </div>
          )}
          {camps.map((c) => {
            const isWinner = !!game && CAMP_WIN[c] === game.winnerTeam;
            return (
            <div className={`card team-${FACTION_SIDE[c] ?? "none"}`} key={c || "none"}>
              <h2 className={`team-title ${isWinner ? "win" : ""}`}>
                {teamLabel(c)} {isWinner ? "★ 승리" : ""}
              </h2>
              {/* table-layout:fixed + 고정폭 → 두 팀 표의 영웅 열 위치가 항상 동일하게 정렬 */}
              <table className="nick-table game-players">
                <thead>
                  <tr>
                    <th>닉네임</th>
                    <th className="c-hero">영웅</th>
                    <th className="c-link"></th>
                  </tr>
                </thead>
                <tbody>
                  {players
                    .filter((p) => p.campType === c)
                    .map((p) => (
                      <tr key={p.ano}>
                        <td className="c-nick">{p.nickname || "(닉 없음)"}</td>
                        <td className="c-hero"><Hero no={p.heroNo} size={28} /></td>
                        <td className="c-link">
                          <Link className="link" to={`/player/${encodeURIComponent(p.ano)}`}>
                            전적
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            );
          })}
        </>
      )}
    </div>
  );
}
