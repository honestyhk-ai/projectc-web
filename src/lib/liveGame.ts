import { supabase } from "./supabase";
import type { LiveGameData, LiveSummary } from "./types";

// 단건: ano 가 지금 진행 중인 게임에 있으면 그 게임 전체를 반환, 없으면 null.
export async function fetchLiveGame(ano: string): Promise<LiveGameData | null> {
  const { data, error } = await supabase.functions.invoke("live-game", { body: { ano } });
  if (error || !data) return null;
  if (data.live && data.game) return data.game as LiveGameData;
  return null;
}

// 배치: 검색결과 ano 목록 중 라이브인 것만 { ano: 요약 } 맵으로.
export async function fetchLiveAnos(anos: string[]): Promise<Record<string, LiveSummary>> {
  if (anos.length === 0) return {};
  const { data, error } = await supabase.functions.invoke("live-game", { body: { anos } });
  if (error || !data?.liveAnos) return {};
  return data.liveAnos as Record<string, LiveSummary>;
}

// 경과 초 -> "18분 22초"
export function elapsedLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}
