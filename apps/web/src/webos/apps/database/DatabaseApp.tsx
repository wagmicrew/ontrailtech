import { useState, useCallback } from 'react';
import { adminFetch } from '../../core/admin-fetch';
import { useTheme } from '../../core/theme-store';

const DB_TABLES = [
  'users', 'wallets', 'auth_nonces', 'friends', 'grid_cells', 'poi_slots', 'pois',
  'routes', 'runner_tokens', 'admin_configs', 'site_settings', 'audit_logs',
  'token_simulations', 'reputation_events', 'aura_events',
];

interface TableRow { [key: string]: any; }
const PAGE_SIZE = 30;

function formatCell(val: any) {
  if (val === null || val === undefined) return <span className="text-gray-400 italic text-xs">null</span>;
  if (typeof val === 'boolean') return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${val ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>{String(val)}</span>;
  if (typeof val === 'object') { const s = JSON.stringify(val); return <span className="text-purple-400 font-mono text-xs">{s.slice(0, 60)}{s.length > 60 ? '\u2026' : ''}</span>; }
  const str = String(val);
  if (str.length > 50) return <span className="font-mono text-xs opacity-70" title={str}>{str.slice(0, 50)}\u2026</span>;
  return <span className="font-mono text-xs opacity-90">{str}</span>;
}

export default function DatabaseApp() {
  const t = useTheme();
  const [mode, setMode] = useState<'browse' | 'sql'>('browse');
  const [table, setTable] = useState('users');
  const [rows, setRows] = useState<TableRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM users LIMIT 20;');
  const [sqlResult, setSqlResult] = useState<{ columns: string[]; rows: any[][]; affected?: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null);
  const [cellValue, setCellValue] = useState('');
  const [page, setPage] = useState(0);

  const loadTable = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await adminFetch(`/admin/db/table/${table}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      setRows(data.rows || []); setColumns(data.columns || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [table, page]);

  const runSQL = async () => {
    setLoading(true); setError(''); setSqlResult(null);
    try { setSqlResult(await adminFetch('/admin/db/sql', { method: 'POST', body: JSON.stringify({ query: sqlQuery }) })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const saveCell = async (rowIdx: number) => {
    const row = rows[rowIdx];
    if (!row.id || !editingCell) return;
    try {
      let parsed: any = cellValue;
      try { parsed = JSON.parse(cellValue); } catch {}
      await adminFetch(`/admin/db/table/${table}/${row.id}`, { method: 'PATCH', body: JSON.stringify({ [editingCell.col]: parsed }) });
      const updated = [...rows]; updated[rowIdx] = { ...updated[rowIdx], [editingCell.col]: parsed }; setRows(updated);
    } catch (e: any) { setError(e.message); }
    finally { setEditingCell(null); }
  };

  return (
    <div className={`p-6 space-y-6 min-h-full ${t.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-semibold ${t.heading}`}>Database</h2>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Browse tables and run SQL queries</p>
        </div>
        <div className="flex gap-2">
          {(['browse', 'sql'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-green-500 text-white' : `${t.bgCard} ${t.textMuted} ${t.bgHover} border ${t.border}`}`}>
              {m === 'browse' ? '🗃 Browse' : '⌨ SQL'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          {error}<button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {mode === 'browse' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 flex-1 max-w-xs border ${t.border} ${t.bgCard}`}>
              <select value={table} onChange={e => { setTable(e.target.value); setPage(0); }}
                className={`text-sm bg-transparent border-none outline-none flex-1 ${t.text}`}>
                {DB_TABLES.map(tb => <option key={tb} value={tb}>{tb}</option>)}
              </select>
            </div>
            <button onClick={loadTable}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              Load
            </button>
          </div>

          {rows.length > 0 ? (
            <div className={`border rounded-xl shadow-sm overflow-hidden ${t.border}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-max">
                  <thead>
                    <tr className={`border-b ${t.bgCard} ${t.border}`}>
                      {columns.map(col => <th key={col} className={`text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${t.sectionLabel}`}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${t.divider}`}>
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className={`group transition-colors ${t.tableHover}`}>
                        {columns.map(col => (
                          <td key={col} className="px-3 py-2 relative">
                            {editingCell?.rowIdx === rowIdx && editingCell.col === col ? (
                              <div className="flex gap-1">
                                <input value={cellValue} onChange={e => setCellValue(e.target.value)} autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') saveCell(rowIdx); if (e.key === 'Escape') setEditingCell(null); }}
                                  className={`border border-blue-400 rounded px-2 py-1 text-xs font-mono w-32 focus:outline-none focus:ring-1 focus:ring-blue-400 ${t.inputBg} ${t.inputText}`} />
                                <button onClick={() => saveCell(rowIdx)} className="px-1.5 py-1 bg-blue-500 text-white rounded text-xs">✓</button>
                                <button onClick={() => setEditingCell(null)} className={`px-1.5 py-1 rounded text-xs ${t.bgCard} ${t.text}`}>✕</button>
                              </div>
                            ) : (
                              <button className={`block text-left w-full hover:text-blue-400 transition-colors`}
                                onDoubleClick={() => { setEditingCell({ rowIdx, col }); setCellValue(typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')); }}>
                                {formatCell(row[col])}
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`px-4 py-3 border-t flex items-center justify-between ${t.border} ${t.bgCard}`}>
                <span className={`text-xs ${t.textMuted}`}>{rows.length} rows · double-click a cell to edit</span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className={`px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40 ${t.bgCard} ${t.border} ${t.text} ${t.bgHover}`}>← Prev</button>
                  <button disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className={`px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40 ${t.bgCard} ${t.border} ${t.text} ${t.bgHover}`}>Next →</button>
                </div>
              </div>
            </div>
          ) : (
            <div className={`border border-dashed rounded-xl py-16 text-center ${t.border} ${t.textMuted}`}>Select a table and click Load</div>
          )}
        </div>
      )}

      {mode === 'sql' && (
        <div className="space-y-4">
          <div className={`border rounded-xl shadow-sm overflow-hidden ${t.border}`}>
            <div className="px-4 py-3 bg-gray-900 rounded-t-xl">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-3 h-3 rounded-full bg-red-400/60" /><div className="w-3 h-3 rounded-full bg-amber-400/60" /><div className="w-3 h-3 rounded-full bg-green-400/60" />
              </div>
              <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} rows={6} spellCheck={false}
                className="w-full bg-transparent text-green-400 font-mono text-sm resize-none outline-none placeholder-gray-600"
                placeholder="SELECT * FROM users WHERE reputation_score > 100 LIMIT 50;"
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSQL(); } }} />
            </div>
            <div className={`px-4 py-3 flex items-center justify-between border-t ${t.border} ${t.bgCard}`}>
              <span className={`text-xs ${t.textMuted}`}>Ctrl+Enter to run</span>
              <button onClick={runSQL} disabled={loading || !sqlQuery.trim()}
                className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                Run Query
              </button>
            </div>
          </div>

          {sqlResult && (
            <div className={`border rounded-xl shadow-sm overflow-hidden ${t.border}`}>
              <div className={`px-4 py-3 border-b ${t.border} ${t.bgCard}`}>
                <span className={`text-sm font-medium ${t.text}`}>
                  {sqlResult.affected !== undefined ? `${sqlResult.affected} rows affected` : `${sqlResult.rows?.length ?? 0} rows returned`}
                </span>
              </div>
              {sqlResult.rows?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-max">
                    <thead><tr className={`border-b ${t.bgCard} ${t.border}`}>{sqlResult.columns.map(col => <th key={col} className={`text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${t.sectionLabel}`}>{col}</th>)}</tr></thead>
                    <tbody className={`divide-y ${t.divider}`}>
                      {sqlResult.rows.map((row, i) => (
                        <tr key={i} className={t.tableHover}>{row.map((cell, j) => <td key={j} className="px-3 py-2">{formatCell(cell)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className={`px-4 py-6 text-center text-sm ${t.textMuted}`}>Query completed with no rows</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
