import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { IpRow, SharedAccountRow } from "../lib/types";

export default function IpPanel({ ano }: { ano: string }) {
  const [ips, setIps] = useState<IpRow[]>([]);
  const [shared, setShared] = useState<SharedAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const [a, b] = await Promise.all([
        supabase.rpc("player_ips", { p_ano: ano }),
        supabase.rpc("ip_shared_accounts", { p_ano: ano }),
      ]);
      if (cancelled) return;
      if (a.error || b.error) setErr((a.error || b.error)!.message);
      setIps((a.data as IpRow[]) ?? []);
      setShared((b.data as SharedAccountRow[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  // IP별로 공유 계정 묶기. IP 정렬: 본인 게임수 많은 순.
  const groups = useMemo(() => {
    const map = new Map<string, SharedAccountRow[]>();
    for (const r of shared) {
      if (!map.has(r.ip)) map.set(r.ip, []);
      map.get(r.ip)!.push(r);
    }
    const myCount = new Map(ips.map((i) => [i.ip, i.game_count]));
    return [...map.entries()].sort((x, y) => (myCount.get(y[0]) ?? 0) - (myCount.get(x[0]) ?? 0));
  }, [shared, ips]);

  const distinctAccounts = useMemo(
    () => new Set(shared.map((r) => r.ano).filter((a) => a !== ano)).size,
    [shared, ano],
  );

  return (
    <div className="card ip-card">
      <h2>
        IP 분석{" "}
        <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
          (IP는 앞 2자리만 저장 — 대략 동일 ISP/지역 신호)
        </span>
      </h2>

      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <div className="ip-grid">
          <div>
            <h3 className="ip-sub">사용 IP ({ips.length})</h3>
            <table className="nick-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>처음</th>
                  <th>마지막</th>
                  <th>게임</th>
                </tr>
              </thead>
              <tbody>
                {ips.map((r) => (
                  <tr key={r.ip}>
                    <td>{r.ip}</td>
                    <td className="muted">{r.first_seen?.slice(0, 10)}</td>
                    <td className="muted">{r.last_seen?.slice(0, 10)}</td>
                    <td>{r.game_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="ip-sub">IP 공유 계정 ({distinctAccounts}개 다른 계정)</h3>
            <div className="shared-list">
              {groups.map(([ip, rows]) => (
                <div key={ip} className="shared-ip">
                  <div className="shared-ip-head">
                    {ip} <span className="muted">· {rows.length}계정</span>
                  </div>
                  {rows.map((r) => (
                    <div key={ip + r.ano} className={`shared-row ${r.ano === ano ? "self" : ""}`}>
                      <Link className="link" to={`/player/${encodeURIComponent(r.ano)}`}>
                        {r.nickname || "(닉 없음)"}
                      </Link>
                      <span className="muted ano">{r.ano}</span>
                      {r.ano === ano && <span className="self-badge">본인</span>}
                      <span className="muted gc">{r.game_count}게임</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
