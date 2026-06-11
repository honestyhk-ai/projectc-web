import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { IpSearchRow } from "../lib/types";

export default function IpSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<IpSearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("accounts_by_ip", { p_ip: term });
    setBusy(false);
    setSearched(true);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data as IpSearchRow[]) ?? []);
  }

  const groups = useMemo(() => {
    const map = new Map<string, IpSearchRow[]>();
    for (const r of rows) {
      if (!map.has(r.ip)) map.set(r.ip, []);
      map.get(r.ip)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="page">
      <form className="searchbar" onSubmit={onSearch}>
        <input
          placeholder="IP 프리픽스 검색 (예: 220.121.  또는  220.)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy}>
          {busy ? "검색 중…" : "IP 검색"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
        저장된 IP는 앞 2자리(예: <code>220.121.</code>)뿐입니다. 앞부분만 입력해도 매칭됩니다.
      </p>

      {err && <div className="error">{err}</div>}

      {groups.map(([ip, accs]) => (
        <div className="card" key={ip}>
          <h2>
            {ip} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {accs.length}계정 · IP 총 {accs[0]?.ip_total}게임</span>
          </h2>
          <div className="result-list">
            {accs.map((a) => (
              <Link
                key={ip + a.ano}
                className="result-row"
                to={`/player/${encodeURIComponent(a.ano)}`}
              >
                <span className="nick">{a.nickname || "(닉 없음)"}</span>
                <span className="ano muted">{a.ano}</span>
                <span className="muted" style={{ marginLeft: "auto" }}>{a.game_count}게임</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {searched && !busy && rows.length === 0 && !err && (
        <div className="muted center-text">해당 IP로 찾은 계정이 없습니다.</div>
      )}
    </div>
  );
}
