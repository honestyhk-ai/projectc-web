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

// campType(0/1) -> 그 진영이 이겼을 때의 winnerTeam 값. 실측으로 확정한 매핑.
//   campType "0" 은 winnerTeam "E" 일 때 승, "1" 은 "U" 일 때 승.
//   winnerTeam "" / "N" 은 무승부·노리절트.
export const CAMP_WIN: Record<string, string> = { "0": "E", "1": "U" };

export type GameResult = "win" | "loss" | "draw";

export function campResult(campType: string, winnerTeam: string): GameResult {
  if (winnerTeam === "" || winnerTeam === "N") return "draw";
  return CAMP_WIN[campType] === winnerTeam ? "win" : "loss";
}

export function teamLabel(campType: string): string {
  return campType === "0" ? "E진영" : campType === "1" ? "U진영" : `진영 ${campType}`;
}

export function winRate(wins: number, games: number): number {
  if (!games) return 0;
  return Math.round((wins / games) * 1000) / 10;
}
