import { useState } from 'react';

export default function Explore() {
  const [pois] = useState<any[]>([]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Explore POIs</h2>
      <div className="bg-gray-200 rounded-lg h-96 flex items-center justify-center mb-6">
        <p className="text-gray-500">Map view — connect Mapbox API key to enable</p>
      </div>
      {pois.length === 0 && (
        <p className="text-gray-500">No nearby POIs found. Start exploring to discover them.</p>
      )}
    </div>
  );
}
