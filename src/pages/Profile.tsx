import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { WinrateSummary, RecentGame, NickHistoryRow, PlayerGrade, PlayerRecord } from "../lib/types";
import { currentStreak } from "../lib/types";
import WinRateCard from "../components/WinRateCard";
import RecentGames from "../components/RecentGames";
import NickHistory from "../components/NickHistory";
import IpPanel from "../components/IpPanel";
import SuspectPanel from "../components/SuspectPanel";
import HeroStats from "../components/HeroStats";
import DetailCard from "../components/DetailCard";
import OfficialRank from "../components/OfficialRank";
import LiveGame from "../components/LiveGame";

export default function Profile() {
  const { ano = "" } = useParams();
  const [summary, setSummary] = useState<WinrateSummary | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [nicks, setNicks] = useState<NickHistoryRow[]>([]);
  const [grade, setGrade] = useState<PlayerGrade | null>(null); // 공식 현재 등급(Top200 진입자만, 점수/순위)
  const [rec, setRec] = useState<PlayerRecord | null>(null); // 클라이언트 RecordInfo(모든 플레이어, 등급/스탯)
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // 온디맨드 새로고침: Edge Function(refresh-record)이 게임 RecordInfo 를 라이브 조회 → 갱신.
  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    const { data, error } = await supabase.functions.invoke("refresh-record", { body: { ano } });
    if (error) setRefreshMsg("새로고침 실패 (프록시 미배포이거나 일시 오류)");
    else if (data?.record) {
      setRec(data.record as PlayerRecord);
      setRefreshMsg("최신 정보로 갱신됨");
    } else setRefreshMsg(data?.error === "no record" ? "공식 기록이 없는 계정입니다" : "갱신 결과 없음");
    setRefreshing(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const [wr, rg, nh, og, or] = await Promise.all([
        supabase.from("player_winrate_summary").select("*").eq("ano", ano).maybeSingle(),
        supabase.rpc("player_recent_games", { p_ano: ano, p_limit: 30 }),
        supabase.rpc("player_nick_history", { p_ano: ano }),
        supabase.rpc("official_grade", { p_ano: ano }),
        supabase.rpc("official_record", { p_ano: ano }),
      ]);
      if (cancelled) return;
      // 공식 등급/전적(official_grade/official_record)은 보조 데이터 — 아직 미수집이거나
      // RPC 미생성이어도 프로필 본문을 막지 않도록 페이지 에러에서 제외(없으면 null 처리).
      const firstErr = wr.error || rg.error || nh.error;
      if (firstErr) setErr(firstErr.message);
      setSummary((wr.data as WinrateSummary) ?? null);
      setGames((rg.data as RecentGame[]) ?? []);
      setNicks((nh.data as NickHistoryRow[]) ?? []);
      setGrade(((og.data as PlayerGrade[]) ?? [])[0] ?? null);
      setRec(((or.data as PlayerRecord[]) ?? [])[0] ?? null);
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
        {!loading && grade?.official_rank != null && (
          <span className="head-stat" title="공식 명예의 전당(Top 200) 기준 현재 순위">
            🏅 <b>{grade.official_rank.toLocaleString()}</b>위
          </span>
        )}
        {!loading && rec?.season_games != null && rec.season_games > 0 && rec.season_winrate != null && (
          <span className="head-stat" title="이번 시즌 랭킹대전 승률">
            시즌 승률 <b>{rec.season_winrate}%</b>
          </span>
        )}
        {!loading && streak.type !== "none" && (
          <span className={`streak ${streak.type}`}>
            {streak.type === "win" ? "🔥" : "❄️"} {streak.count}
            {streak.type === "win" ? "연승" : "연패"}
          </span>
        )}
        {!loading && (
          <button className="refresh-btn" onClick={refresh} disabled={refreshing} title="이 플레이어의 공식 정보를 게임에서 즉시 다시 불러옵니다">
            {refreshing ? "갱신 중…" : "🔄 새로고침"}
          </button>
        )}
        {refreshMsg && <span className="muted refresh-msg">{refreshMsg}</span>}
      </div>

      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <>
          <LiveGame ano={ano} />
          <div className="profile-grid">
            <div className="col-left">
              <OfficialRank grade={grade} rec={rec} rankedGames={summary?.ranked_games ?? 0} />
              <DetailCard ano={ano} nicks={nicks} summary={summary} rec={rec} />
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
