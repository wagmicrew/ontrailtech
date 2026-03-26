export default function Profile() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Runner Profile</h2>
      <p className="text-gray-500 mb-6">Connect your wallet to view your profile and reputation.</p>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-ontrail-700">0</p>
            <p className="text-sm text-gray-500">POIs Owned</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ontrail-700">0</p>
            <p className="text-sm text-gray-500">Routes Done</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ontrail-700">0</p>
            <p className="text-sm text-gray-500">Reputation</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ontrail-700">0</p>
            <p className="text-sm text-gray-500">Friends</p>
          </div>
        </div>
      </div>
    </div>
  );
}
