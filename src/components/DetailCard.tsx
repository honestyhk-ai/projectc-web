import type { HofRow, NickHistoryRow, PlayerRecord, WinrateSummary } from "../lib/types";

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
  hof,
}: {
  ano: string;
  nicks: NickHistoryRow[];
  summary: WinrateSummary | null;
  rec: PlayerRecord | null; // 클라이언트 RecordInfo 기반 (등급/평균스탯/시즌랭크)
  hof: HofRow | null; // 공식 명예의 전당(hall_of_fame) — 공식 KDA는 시즌 Top100만 존재
}) {
  const latestNick = nicks.length ? nicks[nicks.length - 1].nickname : "";
  const prevNicks = nicks
    .slice(0, -1)
    .slice()
    .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
    .slice(0, 2)
    .map((n) => n.nickname);

  // 전체 총전적(모든 시즌, 랭크+일반). 공식 통산(rec.career_*) 우선, 없으면 우리 스크랩(summary.total_*).
  const totalRec =
    rec && rec.career_games != null
      ? record(rec.career_games, rec.career_wins, rec.career_draws)
      : summary
        ? record(summary.total_games, summary.total_wins, summary.draws)
        : "-";

  // 랭킹대전 총전적(모든 시즌 랭크). 공식 랭크누적(rec.ranked_total_*) 우선, 없으면 스크랩(summary.ranked_*).
  const rankedRec =
    rec && rec.ranked_total_games != null
      ? record(rec.ranked_total_games, rec.ranked_total_wins, rec.ranked_total_draws)
      : summary
        ? record(summary.ranked_games, summary.ranked_wins, summary.ranked_draws)
        : "-";

  // 시즌전적(이번시즌 랭킹대전). rec 있으면 실제값, 없거나 0이면 안내.
  const seasonRec =
    rec && rec.season_games != null && rec.season_games > 0
      ? record(rec.season_games, rec.season_wins, rec.season_draws)
      : rec
        ? "이번 시즌 랭크 기록 없음"
        : "-";

  // 진영별 전적(통산). wins/losses/draws → record() 헬퍼로 "N승 M무 K패 (R%)".
  const factionRec = (w?: number | null, l?: number | null, d?: number | null) =>
    w == null ? "-" : record((w ?? 0) + (l ?? 0) + (d ?? 0), w, d);
  const elfRec = rec && rec.elf_wins != null ? factionRec(rec.elf_wins, rec.elf_losses, rec.elf_draws) : "-";
  const undeadRec = rec && rec.undead_wins != null ? factionRec(rec.undead_wins, rec.undead_losses, rec.undead_draws) : "-";

  const n1 = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString());
  // 공식 KDA 단일값(명예의 전당 KDA 컬럼). 공식은 시즌 Top 100만 공개 → 그 밖은 "-".
  const kda = hof?.kda != null ? hof.kda.toFixed(2) : "-";

  return (
    <div className="card">
      <h2>상세 정보</h2>
      <div className="detail-grid">
        {row("닉네임", latestNick || "-")}
        {row("전 닉네임", prevNicks.length ? prevNicks.join(", ") : "-", "현재 제외 최근 2개")}
        {row("계정번호", ano)}
        {row("전체 총전적", totalRec, "모든 시즌 · 랭크+일반 합계")}
        {row("랭킹대전 총전적", rankedRec, "모든 시즌 랭킹대전 누적")}
        {row("시즌 전적", seasonRec, "이번 시즌 랭킹대전 전적")}
        {row("신성연합 전적", elfRec, "신성연합 진영 통산 전적")}
        {row("불사군단 전적", undeadRec, "불사군단 진영 통산 전적")}
        {row("탈주 횟수", rec?.disconnect_count != null ? `${rec.disconnect_count}회` : "-", "연결 끊김/탈주 횟수 (통산)")}
        {row("총 기여도", rec?.total_contribute != null ? n1(rec.total_contribute) : "-")}
        {row("공식 KDA", kda, "공식 명예의 전당 KDA · 시즌 Top 100 진입자만 공개")}
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
