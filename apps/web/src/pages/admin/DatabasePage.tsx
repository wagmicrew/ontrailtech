import { useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('ontrail_token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

const DB_TABLES = [
  'users', 'wallets', 'auth_nonces', 'friends', 'grid_cells', 'poi_slots', 'pois',
  'routes', 'runner_tokens', 'admin_configs', 'site_settings', 'audit_logs',
  'token_simulations', 'reputation_events', 'aura_events',
];

interface TableRow {
  [key: string]: any;
}

export default function DatabasePage() {
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
  const PAGE_SIZE = 30;

  const loadTable = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminFetch(`/admin/db/table/${table}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      setRows(data.rows || []);
      setColumns(data.columns || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [table, page]);

  const runSQL = async () => {
    setLoading(true);
    setError('');
    setSqlResult(null);
    try {
      const data = await adminFetch('/admin/db/sql', {
        method: 'POST',
        body: JSON.stringify({ query: sqlQuery }),
      });
      setSqlResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startCellEdit = (rowIdx: number, col: string, val: any) => {
    setEditingCell({ rowIdx, col });
    setCellValue(typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''));
  };

  const saveCell = async (rowIdx: number) => {
    const row = rows[rowIdx];
    const id = row.id;
    if (!id || !editingCell) return;
    try {
      let parsed: any = cellValue;
      try { parsed = JSON.parse(cellValue); } catch {}
      await adminFetch(`/admin/db/table/${table}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [editingCell.col]: parsed }),
      });
      const updated = [...rows];
      updated[rowIdx] = { ...updated[rowIdx], [editingCell.col]: parsed };
      setRows(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditingCell(null);
    }
  };

  const formatCellDisplay = (val: any) => {
    if (val === null || val === undefined) return <span className="text-gray-300 italic text-xs">null</span>;
    if (typeof val === 'boolean') return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{String(val)}</span>
    );
    if (typeof val === 'object') return <span className="text-purple-600 font-mono text-xs">{JSON.stringify(val).slice(0, 60)}{JSON.stringify(val).length > 60 ? '…' : ''}</span>;
    const str = String(val);
    if (str.length > 50) return <span className="text-gray-600 font-mono text-xs" title={str}>{str.slice(0, 50)}…</span>;
    return <span className="text-gray-700 font-mono text-xs">{str}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Database</h2>
          <p className="text-sm text-gray-500 mt-1">Browse tables and run SQL queries</p>
        </div>
        <div className="flex gap-2">
          {(['browse', 'sql'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m === 'browse' ? '🗃 Browse' : '⌨ SQL'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {mode === 'browse' && (
        <div className="space-y-4">
          {/* Table selector + load button */}
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
              <select value={table} onChange={e => { setTable(e.target.value); setPage(0); }}
                className="text-sm text-gray-700 bg-transparent border-none outline-none flex-1">
                {DB_TABLES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={loadTable}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              {loading ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : null}
              Load
            </button>
          </div>

          {/* Data table */}
          {rows.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-max">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {columns.map(col => (
                        <th key={col} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-blue-50/30 group transition-colors">
                        {columns.map(col => (
                          <td key={col} className="px-3 py-2 relative">
                            {editingCell?.rowIdx === rowIdx && editingCell.col === col ? (
                              <div className="flex gap-1">
                                <input value={cellValue} onChange={e => setCellValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') saveCell(rowIdx); if (e.key === 'Escape') setEditingCell(null); }}
                                  className="border border-blue-400 rounded px-2 py-1 text-xs font-mono w-32 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <button onClick={() => saveCell(rowIdx)} className="px-1.5 py-1 bg-blue-500 text-white rounded text-xs">✓</button>
                                <button onClick={() => setEditingCell(null)} className="px-1.5 py-1 bg-gray-200 rounded text-xs">✕</button>
                              </div>
                            ) : (
                              <button className="block text-left group-hover:text-blue-700 transition-colors w-full"
                                onDoubleClick={() => startCellEdit(rowIdx, col, row[col])}>
                                {formatCellDisplay(row[col])}
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <span className="text-xs text-gray-400">{rows.length} rows  ·  double-click a cell to edit</span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                  <button disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next →</button>
                </div>
              </div>
            </div>
          )}

          {rows.length === 0 && !loading && (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl py-16 text-center text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
              Select a table and click Load
            </div>
          )}
        </div>
      )}

      {mode === 'sql' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-900 rounded-t-xl">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-3 h-3 rounded-full bg-red-400/60" />
                <div className="w-3 h-3 rounded-full bg-amber-400/60" />
                <div className="w-3 h-3 rounded-full bg-green-400/60" />
              </div>
              <textarea
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full bg-transparent text-green-400 font-mono text-sm resize-none outline-none placeholder-gray-600"
                placeholder="SELECT * FROM users WHERE reputation_score > 100 LIMIT 50;"
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSQL(); } }}
              />
            </div>
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400">Ctrl+Enter to run  ·  SELECT only for safety</span>
              <button onClick={runSQL} disabled={loading || !sqlQuery.trim()}
                className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                Run Query
              </button>
            </div>
          </div>

          {sqlResult && (
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {sqlResult.affected !== undefined ? `${sqlResult.affected} rows affected` : `${sqlResult.rows?.length ?? 0} rows returned`}
                </span>
              </div>
              {sqlResult.rows && sqlResult.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-max">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {sqlResult.columns.map(col => (
                          <th key={col} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sqlResult.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50/60">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2">{formatCellDisplay(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Query completed with no rows returned</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCellDisplay(val: any) {
  if (val === null || val === undefined) return <span className="text-gray-300 italic text-xs">null</span>;
  if (typeof val === 'boolean') return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{String(val)}</span>
  );
  if (typeof val === 'object') return <span className="text-purple-600 font-mono text-xs">{JSON.stringify(val).slice(0, 60)}{JSON.stringify(val).length > 60 ? '…' : ''}</span>;
  const str = String(val);
  if (str.length > 50) return <span className="text-gray-600 font-mono text-xs" title={str}>{str.slice(0, 50)}…</span>;
  return <span className="text-gray-700 font-mono text-xs">{str}</span>;
}
