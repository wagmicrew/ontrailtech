import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export default function Home() {
  const { isConnected, login } = useAuth();

  return (
    <div className="space-y-24 pb-20">
      {/* Hero */}
      <motion.section {...fadeUp} transition={{ duration: 0.6 }} className="text-center pt-12 md:pt-20">
        <div className="inline-block px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium mb-6">
          🌍 Built on Base • Powered by real-world activity
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          <span className="bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
            Run. Discover.
          </span>
          <br />
          <span className="text-gray-900">Earn.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          OnTrail turns your outdoor adventures into digital value. Discover POIs, mint NFTs,
          build reputation, and invest in runners through bonding curve tokens.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          {isConnected ? (
            <Link to="/explore"
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:shadow-xl hover:shadow-green-500/25 transition-all hover:-translate-y-0.5">
              Start Exploring →
            </Link>
          ) : (
            <button onClick={login}
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:shadow-xl hover:shadow-green-500/25 transition-all hover:-translate-y-0.5">
              Get Started — It's Free
            </button>
          )}
          <Link to="/tokens"
            className="border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-semibold text-lg hover:border-green-300 hover:bg-green-50/50 transition-all">
            Explore Tokens
          </Link>
        </div>
      </motion.section>

      {/* Features */}
      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.1 }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon="📍" title="Discover & Mint POIs"
            desc="Find real-world Points of Interest. Rare ones become NFTs on Base."
            gradient="from-blue-500/10 to-cyan-500/10" />
          <FeatureCard
            icon="🏃" title="Complete Routes"
            desc="Follow trails, check in at POIs, earn Route NFTs as proof."
            gradient="from-green-500/10 to-emerald-500/10" />
          <FeatureCard
            icon="📈" title="Runner Tokens"
            desc="Every runner gets a token. Buy early on the bonding curve."
            gradient="from-purple-500/10 to-pink-500/10" />
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.2 }}>
        <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { n: 1, title: 'Sign Up', desc: 'Email, Google, or wallet. We create your wallet automatically.', icon: '✨' },
            { n: 2, title: 'Explore', desc: 'Discover POIs near you. The rarer, the more valuable.', icon: '🗺️' },
            { n: 3, title: 'Run & Earn', desc: 'Complete routes, build reputation, climb the leaderboard.', icon: '🏆' },
            { n: 4, title: 'Invest', desc: 'Buy runner tokens early. When they launch, you profit.', icon: '🚀' },
          ].map(({ n, title, desc, icon }) => (
            <div key={n} className="text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 shadow-lg shadow-green-500/20">
                {icon}
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Rarity */}
      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.3 }}>
        <h2 className="text-3xl font-bold text-center mb-8">POI Rarity System</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Common', pct: '50%', color: 'from-gray-300 to-gray-400', glow: '' },
            { name: 'Rare', pct: '30%', color: 'from-blue-400 to-blue-500', glow: 'shadow-blue-500/20' },
            { name: 'Epic', pct: '15%', color: 'from-purple-400 to-purple-500', glow: 'shadow-purple-500/20' },
            { name: 'Legendary', pct: '5%', color: 'from-yellow-400 to-amber-500', glow: 'shadow-yellow-500/30' },
          ].map(({ name, pct, color, glow }) => (
            <div key={name} className={`bg-white rounded-2xl p-6 text-center shadow-lg ${glow} hover:scale-105 transition-transform`}>
              <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-full mx-auto mb-3`} />
              <p className="font-bold text-lg">{name}</p>
              <p className="text-sm text-gray-500">{pct} of slots</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* CTA */}
      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.4 }}
        className="text-center bg-gradient-to-r from-green-500 to-emerald-500 rounded-3xl p-12 text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to hit the trail?</h2>
        <p className="text-green-100 mb-8 text-lg">No wallet needed. Sign up with email and start exploring.</p>
        {isConnected ? (
          <Link to="/explore" className="bg-white text-green-700 px-8 py-4 rounded-2xl font-semibold text-lg hover:shadow-xl transition-all inline-block">
            Go to Explorer →
          </Link>
        ) : (
          <button onClick={login} className="bg-white text-green-700 px-8 py-4 rounded-2xl font-semibold text-lg hover:shadow-xl transition-all">
            Get Started Free
          </button>
        )}
      </motion.section>
    </div>
  );
}

function FeatureCard({ icon, title, desc, gradient }: { icon: string; title: string; desc: string; gradient: string }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-8 hover:shadow-lg transition-all hover:-translate-y-1`}>
      <span className="text-4xl block mb-4">{icon}</span>
      <h3 className="font-bold text-xl mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{desc}</p>
    </div>
  );
}
