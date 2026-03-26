import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Home() {
  const [apiOk, setApiOk] = useState(false);

  useEffect(() => {
    api.health().then(() => setApiOk(true)).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="text-center py-16">
        <h1 className="text-6xl font-bold text-ontrail-700 mb-4">OnTrail</h1>
        <p className="text-xl text-gray-600 mb-2">Web3 Social-Fi for Runners, Hikers & Trail Explorers</p>
        <p className="text-gray-400 mb-8">Discover POIs. Mint NFTs. Earn reputation. Build your token economy.</p>
        <div className="flex gap-4 justify-center">
          <Link to="/explore"
            className="bg-ontrail-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-ontrail-700 transition">
            Start Exploring
          </Link>
          <Link to="/tokens"
            className="border-2 border-ontrail-500 text-ontrail-700 px-6 py-3 rounded-lg font-medium hover:bg-ontrail-50 transition">
            Token Dashboard
          </Link>
        </div>
        {apiOk && (
          <p className="text-xs text-green-500 mt-4">✓ API connected</p>
        )}
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <FeatureCard icon="📍" title="Discover & Mint POIs"
          desc="Find real-world Points of Interest and mint them as NFTs with rarity-based scarcity." />
        <FeatureCard icon="🏃" title="Complete Routes"
          desc="Follow curated trails, check in at POIs, and earn Route NFTs as proof of achievement." />
        <FeatureCard icon="📈" title="Token Economy"
          desc="Invest in runners via bonding curves. When the pool hits threshold, tokens launch on DEX." />
      </div>

      {/* How it works */}
      <div className="bg-white rounded-lg shadow p-8 mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">How OnTrail Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
          <Step num={1} title="Connect Wallet" desc="Sign in with MetaMask" />
          <Step num={2} title="Explore" desc="Discover POIs near you" />
          <Step num={3} title="Mint & Run" desc="Claim POIs, complete routes" />
          <Step num={4} title="Earn & Invest" desc="Build reputation, trade tokens" />
        </div>
      </div>

      {/* Rarity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        <RarityCard rarity="Common" color="bg-gray-400" pct="50%" />
        <RarityCard rarity="Rare" color="bg-blue-500" pct="30%" />
        <RarityCard rarity="Epic" color="bg-purple-500" pct="15%" />
        <RarityCard rarity="Legendary" color="bg-yellow-500" pct="5%" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition">
      <p className="text-3xl mb-3">{icon}</p>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm">{desc}</p>
    </div>
  );
}

function Step({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div>
      <div className="w-10 h-10 bg-ontrail-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">
        {num}
      </div>
      <h4 className="font-semibold">{title}</h4>
      <p className="text-sm text-gray-500">{desc}</p>
    </div>
  );
}

function RarityCard({ rarity, color, pct }: { rarity: string; color: string; pct: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 text-center">
      <div className={`w-8 h-8 ${color} rounded-full mx-auto mb-2`} />
      <p className="font-semibold">{rarity}</p>
      <p className="text-sm text-gray-500">{pct} of slots</p>
    </div>
  );
}
