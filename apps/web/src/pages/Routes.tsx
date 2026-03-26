import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert'];
const DIFF_COLORS: Record<string, string> = {
  easy: 'text-green-600', moderate: 'text-yellow-600', hard: 'text-orange-600', expert: 'text-red-600',
};

export default function RoutesPage() {
  const { isConnected } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState('moderate');
  const [poiIds, setPoiIds] = useState('');
  const [duration, setDuration] = useState(60);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);

  const handleCreate = async () => {
    const ids = poiIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length < 2) { setMessage('Need at least 2 POI IDs'); return; }
    setCreating(true); setMessage('');
    try {
      const route = await api.createRoute({
        name, difficulty, estimated_duration_min: duration, poi_ids: ids,
      });
      setMessage(`Route "${route.name}" created (${route.distance_km} km)`);
      setRoutes((prev) => [route, ...prev]);
      setShowCreate(false); setName(''); setPoiIds('');
    } catch (err: any) { setMessage(err.message); }
    setCreating(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Routes</h2>
        {isConnected && (
          <button onClick={() => setShowCreate(!showCreate)}
            className="bg-ontrail-500 text-white px-4 py-2 rounded text-sm font-medium">
            {showCreate ? 'Cancel' : '+ Create Route'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-semibold mb-3">Create New Route</h3>
          <div className="space-y-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Route name" className="w-full border rounded px-3 py-2 text-sm" />
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              placeholder="Duration (min)" className="w-full border rounded px-3 py-2 text-sm" />
            <textarea value={poiIds} onChange={(e) => setPoiIds(e.target.value)}
              placeholder="POI IDs (comma-separated, min 2)" rows={2}
              className="w-full border rounded px-3 py-2 text-sm" />
            <button onClick={handleCreate} disabled={creating || name.length < 3}
              className="bg-ontrail-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Route'}
            </button>
          </div>
          {message && <p className="text-sm mt-2 text-ontrail-700">{message}</p>}
        </div>
      )}

      {routes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-400">No routes yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routes.map((r) => (
            <div key={r.id} className="bg-white rounded-lg shadow p-4">
              <h4 className="font-semibold">{r.name}</h4>
              <div className="flex gap-4 mt-2 text-sm text-gray-500">
                <span className={DIFF_COLORS[r.difficulty]}>{r.difficulty}</span>
                <span>{r.distance_km} km</span>
                <span>{r.completion_count} completions</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
