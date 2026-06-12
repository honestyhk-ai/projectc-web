import type { NickHistoryRow, PlayerRecord, WinrateSummary } from "../lib/types";

function row(label: string, value: React.ReactNode, hint?: string) {
  return (
    <div className="d-row" title={hint}>
      <span className="d-label muted">{label}</span>
      <span className="d-value">{value}</span>
    </div>
  );
}

// 승/무/패 포맷. games·wins·draws 로 패는 역산. 승=파랑, 패=빨강.
function record(games?: number | null, wins?: number | null, draws?: number | null): React.ReactNode {
  if (games == null || wins == null) return "-";
  const d = draws ?? 0;
  const losses = Math.max(0, games - wins - d);
  const wr = games ? Math.round((1000 * wins) / games) / 10 : 0;
  return (
    <span>
      <span className="win">{wins}승</span> {d}무 <span className="loss">{losses}패</span>{" "}
      <span className="muted">({wr}%)</span>
    </span>
  );
}

export default function DetailCard({
  ano,
  nicks,
  summary,
  rec,
}: {
  ano: string;
  nicks: NickHistoryRow[];
  summary: WinrateSummary | null;
  rec: PlayerRecord | null; // 클라이언트 RecordInfo 기반 (등급/평균스탯/시즌랭크)
}) {
  const latestNick = nicks.length ? nicks[nicks.length - 1].nickname : "";
  const prevNicks = nicks
    .slice(0, -1)
    .slice()
    .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
    .slice(0, 2)
    .map((n) => n.nickname);

  // 시즌전적(이번시즌 랭킹대전). rec 있으면 실제값, 없거나 0이면 안내.
  const seasonRec =
    rec && rec.season_games != null && rec.season_games > 0
      ? record(rec.season_games, rec.season_wins, rec.season_draws)
      : rec
        ? "이번 시즌 랭크 기록 없음"
        : "-";

  const n1 = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString());
  const kda = rec && (rec.kill_avg != null || rec.assist_avg != null)
    ? `킬 ${rec.kill_avg ?? "-"} · 어시 ${rec.assist_avg ?? "-"}`
    : "-";

  return (
    <div className="card">
      <h2>상세 정보</h2>
      <div className="detail-grid">
        {row("닉네임", latestNick || "-")}
        {row("전 닉네임", prevNicks.length ? prevNicks.join(", ") : "-", "현재 제외 최근 2개")}
        {row("계정번호", ano)}
        {row("전체 총전적", summary ? record(summary.total_games, summary.total_wins, summary.draws) : "-", "전 시즌·전체(일반+랭크) 누적")}
        {row("랭킹대전 총전적", summary ? record(summary.ranked_games, summary.ranked_wins, summary.ranked_draws) : "-", "전 시즌 랭킹대전 누적")}
        {row("시즌 전적", seasonRec, "이번 시즌 랭킹대전 전적")}
        {row("총 기여도", rec?.total_contribute != null ? n1(rec.total_contribute) : "-")}
        {row("평균 KDA", kda, "킬·어시 평균 (데스는 공식 미제공)")}
        {row("평균 디스펠", rec?.dispel_avg != null ? rec.dispel_avg : "-")}
        {row("평균 포션", rec?.potion_avg != null ? rec.potion_avg : "-")}
        {row("평균 레벨", rec?.level_avg != null ? rec.level_avg : "-")}
        {row("평균 골드", rec?.gold_avg != null ? n1(rec.gold_avg) : "-")}
      </div>
      {!rec && (
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          공식 전적(등급/기여도/디스펠/포션 등)은 일 1회 수집됩니다. 아직 수집 전이거나 기록이 없는 계정일 수 있어요.
        </p>
      )}
    </div>
  );
}
