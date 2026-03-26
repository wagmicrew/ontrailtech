export default function Home() {
  return (
    <div className="max-w-4xl mx-auto text-center py-20">
      <h1 className="text-5xl font-bold text-ontrail-700 mb-4">OnTrail</h1>
      <p className="text-xl text-gray-600 mb-8">
        Discover trails. Mint POIs. Earn reputation. Join the Web3 explorer economy.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg mb-2">Explore</h3>
          <p className="text-gray-500 text-sm">Discover POIs near you and mint them as NFTs with rarity-based scarcity.</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg mb-2">Complete Routes</h3>
          <p className="text-gray-500 text-sm">Follow curated trails, check in at POIs, and earn Route NFTs.</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg mb-2">Token Economy</h3>
          <p className="text-gray-500 text-sm">Invest in runners via bonding curves and participate in TGE launches.</p>
        </div>
      </div>
    </div>
  );
}
