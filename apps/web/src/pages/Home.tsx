import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const fadeUp = { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 } };
const stagger = { animate: { transition: { staggerChildren: 0.1 } } };

export default function Home() {
  const { isConnected, login } = useAuth();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const logoScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════
          HERO SECTION — Full viewport, epic, flowing
      ═══════════════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative min-h-[calc(100vh-3rem)] overflow-hidden bg-slate-950">
        {/* Full-cover hero image */}
        <div className="absolute inset-0">
          <img
            src="/hero26.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-900/55 to-emerald-950/92" />
        </div>

        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-emerald-500/25 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-teal-400/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-40 left-1/3 w-[700px] h-[700px] bg-green-500/15 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '4s' }} />
        </div>

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {/* Hero content */}
        <motion.div style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] px-6 text-center">

          {/* Logo */}
          <motion.div style={{ scale: logoScale }}
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <img src="/ontrail-logo.png" alt="OnTrail" className="h-12 md:h-16 mb-8 brightness-0 invert opacity-90" />
          </motion.div>

          {/* Badge */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-emerald-300 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Built on Base · Powered by real-world activity
          </motion.div>

          {/* Headline */}
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
            className="text-5xl sm:text-6xl md:text-8xl font-extrabold tracking-tight mb-6 leading-[0.95]">
            <span className="bg-gradient-to-r from-emerald-300 via-green-200 to-teal-300 bg-clip-text text-transparent">
              Run. Discover.
            </span>
            <br />
            <span className="text-white">Earn.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Turn your outdoor adventures into digital value. Discover POIs, mint NFTs,
            build reputation, and invest in runners through bonding curve tokens.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7 }}
            className="flex gap-4 justify-center flex-wrap">
            {isConnected ? (
              <Link to="/explore"
                className="group relative bg-gradient-to-r from-emerald-500 to-green-400 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-1">
                <span className="relative z-10">Start Exploring →</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-green-300 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ) : (
              <button onClick={login}
                className="group relative bg-gradient-to-r from-emerald-500 to-green-400 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-1">
                <span className="relative z-10">Get Started — It's Free</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-green-300 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <Link to="/tokens"
              className="border border-white/20 text-white/80 px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-white/5 hover:border-emerald-400/40 hover:text-white transition-all backdrop-blur-sm">
              Explore Tokens
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center pt-2">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FEATURES SECTION
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            transition={{ duration: 0.6 }} className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              The <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">future</span> of fitness meets finance
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every step you take creates real value on the blockchain.</p>
          </motion.div>

          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard icon="📍" title="Discover & Mint POIs"
              desc="Find real-world Points of Interest. Rare ones become NFTs on Base. The rarer the find, the more valuable."
              gradient="from-blue-500/10 to-cyan-500/10" border="border-blue-500/20" glow="shadow-blue-500/5" />
            <FeatureCard icon="🏃" title="Complete Routes"
              desc="Follow trails, check in at POIs, earn Route NFTs as proof of your adventures."
              gradient="from-emerald-500/10 to-green-500/10" border="border-emerald-500/20" glow="shadow-emerald-500/5" />
            <FeatureCard icon="📈" title="Runner Tokens"
              desc="Every runner gets a personal token. Buy early on the bonding curve. When they launch, you profit."
              gradient="from-purple-500/10 to-pink-500/10" border="border-purple-500/20" glow="shadow-purple-500/5" />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative bg-slate-950 px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <motion.h2 {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="text-3xl md:text-5xl font-bold text-white text-center mb-16">How it works</motion.h2>

          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { n: 1, title: 'Sign Up', desc: 'Email, Google, or wallet. We create your wallet automatically.', icon: '✨', color: 'from-emerald-400 to-green-500' },
              { n: 2, title: 'Explore', desc: 'Discover POIs near you. The rarer, the more valuable.', icon: '🗺️', color: 'from-blue-400 to-cyan-500' },
              { n: 3, title: 'Run & Earn', desc: 'Complete routes, build reputation, climb the leaderboard.', icon: '🏆', color: 'from-amber-400 to-orange-500' },
              { n: 4, title: 'Invest', desc: 'Buy runner tokens early. When they launch, you profit.', icon: '🚀', color: 'from-purple-400 to-pink-500' },
            ].map(({ n, title, desc, icon, color }) => (
              <motion.div key={n} variants={fadeUp} className="text-center group">
                <div className="relative mx-auto mb-6">
                  <div className={`w-16 h-16 bg-gradient-to-br ${color} rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-400 flex items-center justify-center font-mono">
                    {n}
                  </span>
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          POI RARITY
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-b from-slate-950 to-slate-900 px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <motion.h2 {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="text-3xl md:text-5xl font-bold text-white text-center mb-4">POI Rarity System</motion.h2>
          <motion.p {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            transition={{ delay: 0.1 }}
            className="text-slate-400 text-center mb-12 text-lg">Not all discoveries are equal.</motion.p>

          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Common', pct: '50%', color: 'from-slate-400 to-slate-500', ring: 'ring-slate-500/30', glow: '' },
              { name: 'Rare', pct: '30%', color: 'from-blue-400 to-blue-500', ring: 'ring-blue-500/30', glow: 'shadow-blue-500/10' },
              { name: 'Epic', pct: '15%', color: 'from-purple-400 to-purple-500', ring: 'ring-purple-500/30', glow: 'shadow-purple-500/10' },
              { name: 'Legendary', pct: '5%', color: 'from-amber-400 to-orange-500', ring: 'ring-amber-500/30', glow: 'shadow-amber-500/20' },
            ].map(({ name, pct, color, ring, glow }) => (
              <motion.div key={name} variants={fadeUp}
                className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center shadow-xl ${glow} hover:scale-105 transition-all duration-300 hover:border-slate-600`}>
                <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-full mx-auto mb-4 ring-4 ${ring}`} />
                <p className="font-bold text-lg text-white">{name}</p>
                <p className="text-sm text-slate-500">{pct} of slots</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative bg-slate-900 px-6 py-24 md:py-32">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="relative text-center bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-teal-500/10 border border-emerald-500/20 rounded-3xl p-12 md:p-16 overflow-hidden">
            {/* Background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px]" />

            <div className="relative z-10">
              <img src="/ontrail-logo.png" alt="OnTrail" className="h-8 mx-auto mb-6 brightness-0 invert opacity-60" />
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Ready to hit the trail?</h2>
              <p className="text-slate-400 mb-10 text-lg max-w-xl mx-auto">
                No wallet needed. Sign up with email and start exploring. Your adventure creates real value.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                {isConnected ? (
                  <Link to="/explore"
                    className="bg-gradient-to-r from-emerald-500 to-green-400 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-1">
                    Go to Explorer →
                  </Link>
                ) : (
                  <button onClick={login}
                    className="bg-gradient-to-r from-emerald-500 to-green-400 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-1">
                    Get Started Free
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer override for dark theme */}
      <div className="bg-slate-950 border-t border-slate-800 text-center text-xs text-slate-600 py-6 px-6">
        <p>OnTrail — Web3 SocialFi for Explorers · Built on Base</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, gradient, border, glow }: {
  icon: string; title: string; desc: string; gradient: string; border: string; glow: string;
}) {
  return (
    <motion.div variants={fadeUp}
      className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-8 shadow-xl ${glow} hover:-translate-y-1 transition-all duration-300 backdrop-blur-sm`}>
      <span className="text-4xl block mb-4">{icon}</span>
      <h3 className="font-bold text-xl text-white mb-2">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}
