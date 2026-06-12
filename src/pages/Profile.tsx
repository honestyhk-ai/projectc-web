import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { WinrateSummary, RecentGame, NickHistoryRow, PlayerOverview } from "../lib/types";
import { currentStreak } from "../lib/types";
import WinRateCard from "../components/WinRateCard";
import RecentGames from "../components/RecentGames";
import NickHistory from "../components/NickHistory";
import IpPanel from "../components/IpPanel";
import SuspectPanel from "../components/SuspectPanel";
import HeroStats from "../components/HeroStats";
import DetailCard from "../components/DetailCard";
import OfficialRank from "../components/OfficialRank";

export default function Profile() {
  const { ano = "" } = useParams();
  const [summary, setSummary] = useState<WinrateSummary | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [nicks, setNicks] = useState<NickHistoryRow[]>([]);
  const [overview, setOverview] = useState<PlayerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const [wr, rg, nh, ov] = await Promise.all([
        supabase.from("player_winrate_summary").select("*").eq("ano", ano).maybeSingle(),
        supabase.rpc("player_recent_games", { p_ano: ano, p_limit: 30 }),
        supabase.rpc("player_nick_history", { p_ano: ano }),
        supabase.rpc("player_overview", { p_ano: ano }),
      ]);
      if (cancelled) return;
      const firstErr = wr.error || rg.error || nh.error || ov.error;
      if (firstErr) setErr(firstErr.message);
      setSummary((wr.data as WinrateSummary) ?? null);
      setGames((rg.data as RecentGame[]) ?? []);
      setNicks((nh.data as NickHistoryRow[]) ?? []);
      setOverview(((ov.data as PlayerOverview[]) ?? [])[0] ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  const latestNick = nicks.length ? nicks[nicks.length - 1].nickname : "";
  const streak = currentStreak(games.map((g) => g.is_win));

  return (
    <div className="page">
      <div className="profile-head">
        <h1>{latestNick || "플레이어"}</h1>
        <span className="ano muted">{ano}</span>
        {!loading && streak.type !== "none" && (
          <span className={`streak ${streak.type}`}>
            {streak.type === "win" ? "🔥" : "❄️"} {streak.count}
            {streak.type === "win" ? "연승" : "연패"}
          </span>
        )}
      </div>

      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <>
          <div className="profile-grid">
            <div className="col-left">
              <OfficialRank ano={ano} rankedGames={summary?.ranked_games ?? 0} />
              <DetailCard ano={ano} overview={overview} summary={summary} />
              <WinRateCard s={summary} />
              <NickHistory rows={nicks} />
            </div>
            <div className="col-right">
              <HeroStats ano={ano} />
              <RecentGames games={games} />
            </div>
          </div>
          <SuspectPanel ano={ano} />
          <IpPanel ano={ano} />
        </>
      )}
    </div>
  );
}
