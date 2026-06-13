import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchLiveAnos, elapsedLabel } from "../lib/liveGame";
import { gameTypeLabel } from "../lib/types";
import type { SearchResult, LiveSummary } from "../lib/types";

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [live, setLive] = useState<Record<string, LiveSummary>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const nav = useNavigate();

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setErr(null);
    setLive({});
    const { data, error } = await supabase.rpc("search_players", { q: term });
    setBusy(false);
    setSearched(true);
    if (error) {
      setErr(error.message);
      setResults([]);
      return;
    }
    const rows = (data as SearchResult[]) ?? [];
    setResults(rows);
    // 실시간 게임 여부는 비차단으로 뒤따라 채움(검색 결과 표시를 막지 않음).
    if (rows.length) {
      void fetchLiveAnos(rows.map((r) => r.ano)).then(setLive);
    }
  }

  return (
    <div className="page">
      <form className="searchbar" onSubmit={onSearch}>
        <input
          placeholder="닉네임 또는 계정(ano) 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy}>
          {busy ? "검색 중…" : "검색"}
        </button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="result-list">
        {results.map((r) => {
          const lv = live[r.ano];
          return (
            <button
              key={r.ano}
              className="result-row"
              onClick={() => nav(`/player/${encodeURIComponent(r.ano)}`)}
            >
              <span className="nick">{r.nickname || "(닉 없음)"}</span>
              {lv && (
                <span className="live-badge" title={`${gameTypeLabel(lv.roomType)} · ${elapsedLabel(lv.gameTime)} 경과`}>
                  <span className="live-dot" /> LIVE
                </span>
              )}
              <span className="ano muted">{r.ano}</span>
            </button>
          );
        })}
        {searched && !busy && results.length === 0 && !err && (
          <div className="muted center-text">검색 결과가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
