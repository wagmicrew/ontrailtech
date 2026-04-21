import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '../../core/admin-fetch';
import { useTheme } from '../../core/theme-store';

interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  wallet_address: string | null;
  roles: string[];
  reputation_score: number;
  onboarding_completed: boolean;
  created_at: string;
}

const ROLES = ['user', 'admin', 'ancient_owner', 'moderator'];
const PAGE_SIZE = 20;

export default function UsersApp() {
  const t = useTheme();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserRow>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [tab, setTab] = useState<'users' | 'sessions'>('users');
  const [page, setPage] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (search) params.set('q', search);
      const data = await adminFetch(`/admin/users?${params}`);
      setUsers(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const saveUser = async () => {
    if (!editing) return;
    try {
      await adminFetch(`/admin/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setEditing(null); loadUsers();
    } catch (e: any) { setError(e.message); }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try { await adminFetch(`/admin/users/${id}`, { method: 'DELETE' }); loadUsers(); }
    catch (e: any) { setError(e.message); }
  };

  const loadSessions = async (userId: string) => {
    setSessionUser(userId);
    try { setSessions(await adminFetch(`/admin/users/${userId}/sessions`)); }
    catch (e: any) { setError(e.message); }
  };

  const revokeSession = async (sessionId: string) => {
    try { await adminFetch(`/admin/sessions/${sessionId}`, { method: 'DELETE' }); if (sessionUser) loadSessions(sessionUser); }
    catch (e: any) { setError(e.message); }
  };

  const startEdit = (u: UserRow) => { setEditing(u); setEditForm({ username: u.username || '', email: u.email || '', roles: [...u.roles] }); };

  return (
    <div className={`p-6 space-y-6 min-h-full ${t.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-semibold ${t.heading}`}>Users</h2>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Manage users, roles, and active sessions</p>
        </div>
        <div className="flex gap-2">
          {(['users', 'sessions'] as const).map(tabId => (
            <button key={tabId} onClick={() => setTab(tabId)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === tabId ? 'bg-green-500 text-white' : `${t.bgCard} ${t.textMuted} ${t.bgHover} border ${t.border}`}`}>
              {tabId === 'users' ? 'User List' : 'Sessions'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {tab === 'users' && (
        <>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by username, email, or wallet…"
              className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 ${t.inputBorder} ${t.inputBg} ${t.inputText}`} />
          </div>

          <div className={`border rounded-xl overflow-hidden shadow-sm ${t.border}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${t.bgCard} ${t.border}`}>
                    {['User', 'Email', 'Wallet', 'Roles', 'Rep', 'Joined', 'Actions'].map(h => (
                      <th key={h} className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide ${t.sectionLabel}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${t.divider}`}>
                  {loading ? (
                    <tr><td colSpan={7} className={`px-4 py-8 text-center ${t.textMuted}`}>Loading…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={7} className={`px-4 py-8 text-center ${t.textMuted}`}>No users found</td></tr>
                  ) : users.map(u => (
                    <tr key={u.id} className={`transition-colors ${t.tableHover}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(u.username || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <span className={`font-medium ${t.text}`}>{u.username || <span className={`italic ${t.textMuted}`}>—</span>}</span>
                            <div className={`text-xs font-mono ${t.textMuted}`}>{u.id.slice(0, 8)}…</div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs ${t.textMuted}`}>{u.email || <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3">
                        {u.wallet_address ? (
                          <span className={`font-mono text-xs ${t.textMuted}`}>{u.wallet_address.slice(0, 6)}…{u.wallet_address.slice(-4)}</span>
                        ) : <span className="opacity-30">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(u.roles || []).map(r => (
                            <span key={r} className={`px-2 py-0.5 rounded-full text-xs font-medium ${r === 'admin' ? 'bg-purple-100 text-purple-700' : r === 'ancient_owner' ? 'bg-amber-100 text-amber-700' : t.badge}`}>{r}</span>
                          ))}
                        </div>
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs ${t.textMuted}`}>{u.reputation_score?.toFixed(1)}</td>
                      <td className={`px-4 py-3 text-xs ${t.textMuted}`}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(u)} className={`p-1.5 rounded-md transition-colors ${t.textMuted} hover:text-green-500 hover:bg-green-500/10`} title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => { setTab('sessions'); loadSessions(u.id); }} className={`p-1.5 rounded-md transition-colors ${t.textMuted} hover:text-blue-500 hover:bg-blue-500/10`} title="Sessions">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                          </button>
                          <button onClick={() => deleteUser(u.id)} className={`p-1.5 rounded-md transition-colors ${t.textMuted} hover:text-red-500 hover:bg-red-500/10`} title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`px-4 py-3 border-t flex items-center justify-between ${t.border} ${t.bgCard}`}>
              <span className={`text-xs ${t.textMuted}`}>Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + users.length}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className={`px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40 ${t.bgCard} ${t.border} ${t.text} ${t.bgHover}`}>← Prev</button>
                <button disabled={users.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className={`px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40 ${t.bgCard} ${t.border} ${t.text} ${t.bgHover}`}>Next →</button>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <div className={`border rounded-xl shadow-sm ${t.border}`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between ${t.border} ${t.bgCard}`}>
            <div>
              <h3 className={`font-semibold ${t.heading}`}>Active Sessions</h3>
              {sessionUser && <p className={`text-xs mt-0.5 ${t.textMuted}`}>User ID: {sessionUser}</p>}
            </div>
            <button onClick={() => setTab('users')} className={`text-sm ${t.textMuted} hover:${t.text}`}>← Back to users</button>
          </div>
          {sessions.length === 0 ? (
            <div className={`px-6 py-10 text-center text-sm ${t.textMuted}`}>{sessionUser ? 'No active sessions' : 'Select a user to view sessions'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className={`border-b ${t.bgCard} ${t.border}`}>{['Token (partial)', 'IP Address', 'Created', 'Expires', ''].map(h => <th key={h} className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide ${t.sectionLabel}`}>{h}</th>)}</tr></thead>
              <tbody className={`divide-y ${t.divider}`}>
                {sessions.map((s: any) => (
                  <tr key={s.id} className={t.tableHover}>
                    <td className={`px-4 py-3 font-mono text-xs ${t.textMuted}`}>{s.token_hash?.slice(0, 20)}…</td>
                    <td className={`px-4 py-3 ${t.text}`}>{s.ip_address || '—'}</td>
                    <td className={`px-4 py-3 text-xs ${t.textMuted}`}>{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</td>
                    <td className={`px-4 py-3 text-xs ${t.textMuted}`}>{s.expires_at ? new Date(s.expires_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3"><button onClick={() => revokeSession(s.id)} className="px-3 py-1 text-xs bg-red-500/15 text-red-500 rounded-lg hover:bg-red-500/25 font-medium">Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className={`rounded-2xl shadow-2xl w-full max-w-md ${t.bg} border ${t.border}`}>
            <div className={`px-6 py-5 border-b ${t.border}`}>
              <h3 className={`font-semibold ${t.heading}`}>Edit User</h3>
              <p className={`text-xs mt-0.5 font-mono ${t.textMuted}`}>{editing.id}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${t.textMuted}`}>Username</label>
                <input value={editForm.username || ''} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 ${t.inputBorder} ${t.inputBg} ${t.inputText}`} />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${t.textMuted}`}>Email</label>
                <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 ${t.inputBorder} ${t.inputBg} ${t.inputText}`} />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-2 ${t.textMuted}`}>Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map(r => (
                    <button key={r} type="button"
                      onClick={() => setEditForm(f => ({ ...f, roles: (f.roles || []).includes(r) ? (f.roles || []).filter(x => x !== r) : [...(f.roles || []), r] }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(editForm.roles || []).includes(r) ? 'bg-green-500 text-white' : `${t.bgCard} ${t.textMuted} ${t.bgHover} border ${t.border}`}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={`px-6 py-4 border-t flex gap-3 justify-end ${t.border}`}>
              <button onClick={() => setEditing(null)} className={`px-4 py-2 text-sm ${t.textMuted}`}>Cancel</button>
              <button onClick={saveUser} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
