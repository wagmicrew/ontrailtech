import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const RARITY_COLORS: Record<string, string> = {
  legendary: 'bg-yellow-500', epic: 'bg-purple-500', rare: 'bg-blue-500', common: 'bg-gray-400',
};

export default function Explore() {
  const { isConnected } = useAuth();
  const [pois, setPois] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [mintName, setMintName] = useState('');
  const [minting, setMinting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setCoords({ lat: 59.33, lon: 18.07 }), // Default Stockholm
      );
    }
  }, []);

  useEffect(() => {
    if (coords) loadPois();
  }, [coords]);

  const loadPois = async () => {
    if (!coords) return;
    setLoading(true);
    try {
      const data = await api.getNearbyPois(coords.lat, coords.lon, 10);
      setPois(data);
    } catch (err: any) {
      setMessage(err.message);
    }
    setLoading(false);
  };

  const handleMint = async () => {
    if (!coords || !mintName) return;
    setMinting(true);
    setMessage('');
    try {
      const poi = await api.mintPoi(mintName, coords.lat, coords.lon);
      setMessage(`Minted "${poi.name}" (${poi.rarity}) successfully!`);
      setMintName('');
      loadPois();
    } catch (err: any) {
      setMessage(err.message);
    }
    setMinting(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Explore POIs</h2>

      {coords && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm text-gray-500">
            📍 Your location: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
          </p>
        </div>
      )}

      {/* Map placeholder */}
      <div className="bg-gradient-to-br from-green-100 to-blue-100 rounded-lg h-64 flex items-center justify-center mb-6 border-2 border-dashed border-green-300">
        <div className="text-center">
          <p className="text-green-700 font-medium">🗺️ Map Explorer</p>
          <p className="text-sm text-gray-500 mt-1">
            {pois.length} POIs found nearby • Add Mapbox key to enable map
          </p>
        </div>
      </div>

      {/* Mint POI */}
      {isConnected && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="font-semibold mb-2">Mint a POI at your location</h3>
          <div className="flex gap-2">
            <input
              type="text" value={mintName} onChange={(e) => setMintName(e.target.value)}
              placeholder="POI name (3-100 chars)" minLength={3} maxLength={100}
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button onClick={handleMint} disabled={minting || mintName.length < 3}
              className="bg-ontrail-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              {minting ? 'Minting...' : 'Mint POI'}
            </button>
          </div>
          {message && <p className="text-sm mt-2 text-ontrail-700">{message}</p>}
        </div>
      )}

      {/* POI List */}
      {loading ? (
        <p className="text-gray-500">Loading POIs...</p>
      ) : pois.length === 0 ? (
        <p className="text-gray-500">No POIs found nearby. Be the first to mint one!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pois.map((poi) => (
            <div key={poi.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-3 h-3 rounded-full ${RARITY_COLORS[poi.rarity] || 'bg-gray-300'}`} />
                <span className="text-xs uppercase font-medium text-gray-500">{poi.rarity}</span>
              </div>
              <h4 className="font-semibold">{poi.name}</h4>
              <p className="text-xs text-gray-400 mt-1">
                {poi.distance_km ? `${poi.distance_km} km away` : `${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
