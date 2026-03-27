import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ReputationAura, { type AuraLevel } from '../components/ReputationAura';

export default function Profile() {
  const { isConnected, userId, wallet } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [auraLevel, setAuraLevel] = useState<AuraLevel>('None');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isConnected && userId) loadProfile();
  }, [isConnected, userId]);

  const loadProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        api.getUser(userId),
        api.getReputation(userId),
      ]);
      setProfile(p);
      setReputation(r);
    } catch {}
    setLoading(false);
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Runner Profile</h2>
        <p className="text-gray-500">Connect your wallet to view your profile.</p>
      </div>
    );
  }

  if (loading) return <p className="text-gray-500">Loading profile...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Runner Profile</h2>
      {profile && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <ReputationAura
              auraLevel={auraLevel}
              reputation={reputation?.total ?? 0}
              size={64}
              auraSpread={20}
            >
              <div className="w-16 h-16 bg-ontrail-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {profile.username?.[0]?.toUpperCase() || '?'}
              </div>
            </ReputationAura>
            <div>
              <h3 className="text-xl font-bold">{profile.username}</h3>
              <p className="text-sm text-gray-500 font-mono">{wallet}</p>
              <p className="text-xs text-gray-400 mt-1">
                {profile.username}.ontrail.tech
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Reputation" value={reputation?.total || 0} icon="⭐" />
        <StatCard label="POIs Owned" value={reputation?.components?.pois_owned || 0} icon="📍" />
        <StatCard label="Routes Done" value={reputation?.components?.routes_completed || 0} icon="🏃" />
        <StatCard label="Network" value={reputation?.components?.friend_network || 0} icon="👥" />
      </div>

      {/* Reputation Breakdown */}
      {reputation && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Reputation Breakdown</h3>
          <div className="space-y-3">
            <RepBar label="POIs" value={reputation.components.pois_owned} max={reputation.total || 1} color="bg-blue-500" />
            <RepBar label="Routes" value={reputation.components.routes_completed} max={reputation.total || 1} color="bg-green-500" />
            <RepBar label="Friends" value={reputation.components.friend_network} max={reputation.total || 1} color="bg-purple-500" />
            <RepBar label="Tokens" value={reputation.components.token_impact} max={reputation.total || 1} color="bg-yellow-500" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 text-center">
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-2xl font-bold text-ontrail-700">{typeof value === 'number' ? value.toFixed(0) : value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function RepBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono text-gray-500">{value.toFixed(1)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
