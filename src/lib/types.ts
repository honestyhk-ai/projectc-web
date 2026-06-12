// ProjectC.exe (gamestat_store) 의 테이블/쿼리에서 도출한 스키마.
// 컬럼명은 원본 DB의 camelCase 따옴표 식별자("gameID" 등)를 그대로 따름.

export interface SearchResult {
  ano: string;
  nickname: string;
}

export interface WinrateSummary {
  ano: string;
  normal_games: number;
  normal_wins: number;
  normal_draws: number;
  ranked_games: number;
  ranked_wins: number;
  ranked_draws: number;
  draws: number;
  total_games: number;
  total_wins: number;
}

export interface RecentGame {
  gameID: string;
  date: string;
  roomType: string;
  averageRating: string | null;
  heroNo: string;
  campType: string;
  mvpOdds: string | null;
  winnerTeam: string;
  gameTime: string | null;
  liveType: string;
  is_win: boolean | null; // true=승, false=패, null=무/노리절트
}

export interface NickHistoryRow {
  nickname: string;
  first_seen: string;
  last_seen: string;
  games: number;
}

export interface GameRow {
  gameID: string;
  date: string;
  roomType: string;
  mapType: string | null;
  ruleType: string | null;
  gameTime: string | null;
  title: string | null;
  winnerTeam: string;
  averageRating: string | null;
  liveType: string;
}

export interface GamePlayerRow {
  gameID: string;
  ano: string;
  nickname: string;
  campType: string;
  heroNo: string;
  mvpOdds: string | null;
}

// IP 기능 (player_ip / game_player.ip 기반). 저장된 ip 는 앞 2옥텟 프리픽스.
export interface IpRow {
  ip: string;
  first_seen: string;
  last_seen: string;
  game_count: number;
}

export interface SharedAccountRow {
  ip: string;
  ano: string;
  nickname: string;
  game_count: number;
}

// 부계정 의심쌍 (suspect_pairs). identity_score 0~1 (저장 임계 0.65).
export interface SuspectRow {
  other_ano: string;
  other_nick: string;
  identity_score: number;
  shared_ip_count: number;
  game_count_other: number;
  timing_overlap: boolean;
  concurrent_ratio: number;
  signal_details: Record<string, number> | null;
}

// IP 프리픽스 검색 결과 (accounts_by_ip)
export interface IpSearchRow {
  ip: string;
  ano: string;
  nickname: string;
  game_count: number;
  ip_total: number;
}

// 주력 영웅 (player_heroes RPC)
export interface HeroStat {
  hero_no: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number | null;
}

// 플레이어 개요 (player_overview RPC)
export interface PlayerOverview {
  first_seen: string;
  last_seen: string;
  ip_count: number;
  total_games: number;
  avg_mvp: number | null;
}

// 현재 연승/연패: 최근 경기(최신순)에서 무승부 제외 후 선두 연속 구간
export function currentStreak(isWins: (boolean | null)[]): { type: "win" | "loss" | "none"; count: number } {
  const decided = isWins.filter((w) => w !== null) as boolean[];
  if (decided.length === 0) return { type: "none", count: 0 };
  const first = decided[0];
  let count = 0;
  for (const w of decided) {
    if (w === first) count++;
    else break;
  }
  return { type: first ? "win" : "loss", count };
}

export function scoreClass(score: number): "hi" | "mid" | "lo" {
  if (score >= 0.9) return "hi";
  if (score >= 0.8) return "mid";
  return "lo";
}

// 명예의 전당 (hall_of_fame_current RPC) — 공식 HallOfFame.aspx 상위 100 미러
export interface HofRow {
  season_year: number;
  season_no: number;
  rank: number;
  ano: string;
  nickname: string;
  grade_icon: number | null;
  grade_text: string; // '다이아몬드' | '자수정 4' | '루비 5' ...
  season_change: string; // ▲8 / ▼2 / NEW / -
  daily_change: string;
  winrate: number | null;
  kda: number | null;
  games: number | null;
  contribution: number | null;
  hero1: string;
  hero1_name: string;
  hero2: string;
  hero2_name: string;
}

// 순위 (ranking RPC) — 실측 랭크 통계 기준 (정렬: wins/winrate/games)
export type RankSort = "wins" | "winrate" | "games";

export interface RankRow {
  rnk: number;
  ano: string;
  nickname: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

// roomType -> 표시 라벨.
// "2"=일반, "3"=랭크 는 실제 DB의 player_winrate_summary(normal/ranked) 와 대조해 확정.
// "0","1" 은 의미가 불확실 → 폴백("타입 N")으로 표시. 알게 되면 여기만 고치면 됨.
export const GAME_TYPE_LABELS: Record<string, string> = {
  "2": "일반",
  "3": "랭크",
};

export function gameTypeLabel(roomType: string): string {
  return GAME_TYPE_LABELS[roomType] ?? `타입 ${roomType}`;
}

// 진영 매핑 (.exe game_detail 에서 확정):
//   campType "0" = winnerTeam "E" = 신성연합, campType "1" = winnerTeam "U" = 불사군단.
//   winnerTeam "" / "N" = 무승부·노리절트.
export const CAMP_WIN: Record<string, string> = { "0": "E", "1": "U" };

// campType -> 진영 이름
export const FACTION: Record<string, string> = { "0": "신성연합", "1": "불사군단" };
// 진영별 색 키 (CSS class 용)
export const FACTION_SIDE: Record<string, "holy" | "undead"> = { "0": "holy", "1": "undead" };

export type GameResult = "win" | "loss" | "draw";

export function campResult(campType: string, winnerTeam: string): GameResult {
  if (winnerTeam === "" || winnerTeam === "N") return "draw";
  return CAMP_WIN[campType] === winnerTeam ? "win" : "loss";
}

export function teamLabel(campType: string): string {
  return FACTION[campType] ?? `진영 ${campType}`;
}

// winnerTeam 값 -> 진영 이름 (E/U/N/'')
export function winnerTeamLabel(winnerTeam: string): string {
  if (winnerTeam === "E") return "신성연합";
  if (winnerTeam === "U") return "불사군단";
  if (winnerTeam === "" || winnerTeam === "N") return "무승부";
  return winnerTeam;
}

export function winRate(wins: number, games: number): number {
  if (!games) return 0;
  return Math.round((wins / games) * 1000) / 10;
}
