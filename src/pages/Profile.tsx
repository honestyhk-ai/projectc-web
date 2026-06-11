import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { WinrateSummary, RecentGame, NickHistoryRow } from "../lib/types";
import WinRateCard from "../components/WinRateCard";
import RecentGames from "../components/RecentGames";
import NickHistory from "../components/NickHistory";
import IpPanel from "../components/IpPanel";
import SuspectPanel from "../components/SuspectPanel";

export default function Profile() {
  const { ano = "" } = useParams();
  const [summary, setSummary] = useState<WinrateSummary | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [nicks, setNicks] = useState<NickHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const [wr, rg, nh] = await Promise.all([
        supabase.from("player_winrate_summary").select("*").eq("ano", ano).maybeSingle(),
        supabase.rpc("player_recent_games", { p_ano: ano, p_limit: 30 }),
        supabase.rpc("player_nick_history", { p_ano: ano }),
      ]);
      if (cancelled) return;
      const firstErr = wr.error || rg.error || nh.error;
      if (firstErr) setErr(firstErr.message);
      setSummary((wr.data as WinrateSummary) ?? null);
      setGames((rg.data as RecentGame[]) ?? []);
      setNicks((nh.data as NickHistoryRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  const latestNick = nicks.length ? nicks[nicks.length - 1].nickname : "";

  return (
    <div className="page">
      <div className="profile-head">
        <h1>{latestNick || "플레이어"}</h1>
        <span className="ano muted">{ano}</span>
      </div>

      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <div className="profile-grid">
          <div className="col-left">
            <WinRateCard s={summary} />
            <NickHistory rows={nicks} />
          </div>
          <div className="col-right">
            <RecentGames games={games} />
          </div>
        </div>
      )}

      {!loading && <SuspectPanel ano={ano} />}
      {!loading && <IpPanel ano={ano} />}
    </div>
  );
}
