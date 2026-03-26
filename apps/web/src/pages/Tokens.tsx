export default function Tokens() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Token Dashboard</h2>
      <p className="text-gray-500 mb-6">Invest in runners via bonding curves and track your portfolio.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-2">Your Holdings</h3>
          <p className="text-gray-400 text-sm">Connect wallet to view your friend shares.</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-2">Trending Runners</h3>
          <p className="text-gray-400 text-sm">No active bonding curves yet.</p>
        </div>
      </div>
    </div>
  );
}
