import type { NickHistoryRow } from "../lib/types";

export default function NickHistory({ rows }: { rows: NickHistoryRow[] }) {
  return (
    <div className="card">
      <h2>닉네임 이력 ({rows.length})</h2>
      {rows.length === 0 && <p className="muted">기록 없음.</p>}
      {rows.length > 0 && (
        <table className="nick-table">
          <thead>
            <tr>
              <th>닉네임</th>
              <th>처음</th>
              <th>마지막</th>
              <th>경기</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.nickname}-${i}`}>
                <td>{r.nickname}</td>
                <td className="muted">{r.first_seen?.slice(0, 10)}</td>
                <td className="muted">{r.last_seen?.slice(0, 10)}</td>
                <td>{r.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
