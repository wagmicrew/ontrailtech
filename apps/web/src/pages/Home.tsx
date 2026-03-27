import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const StepIconSignUp = () => (
  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
  </svg>
);
const StepIconExplore = () => (
  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const StepIconRun = () => (
  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);
const StepIconInvest = () => (
  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
);

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
      <section ref={heroRef} className="relative min-h-[calc(100vh-3rem)] overflow-hidden bg-emerald-950">
        {/* Full-cover hero image */}
        <div className="absolute inset-0">
          <img
            src="/hero26.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-emerald-950/85" />
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
            className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
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
          STATS BAR — social proof, light
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white border-b border-gray-100 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '12,400+', label: 'POIs discovered' },
              { value: '3,800+', label: 'Active runners' },
              { value: '€140k+', label: 'Runner token volume' },
              { value: '98k+', label: 'Routes logged' },
            ].map(({ value, label }) => (
              <motion.div key={label} variants={fadeUp} className="text-center">
                <p className="text-2xl md:text-3xl font-extrabold text-gray-900 tabular-nums">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FEATURES — bento grid, light
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 px-6 py-20 md:py-28">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            transition={{ duration: 0.6 }} className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-full border border-emerald-100 mb-4">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> What you unlock
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
              Fitness meets{' '}
              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">finance</span>
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">Every step you take creates real, verifiable value on the blockchain.</p>
          </motion.div>

          {/* Bento grid */}
          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* Large card – POIs */}
            <motion.div variants={fadeUp}
              className="md:col-span-2 group relative bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-60" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-xl text-gray-900 mb-2">Discover & Mint POIs</h3>
                <p className="text-gray-500 leading-relaxed max-w-sm">Find real-world Points of Interest. Rare ones become NFTs on Base. The rarer the find, the more it's worth.</p>
                <div className="mt-6 flex gap-2 flex-wrap">
                  {['Common', 'Rare', 'Epic', 'Legendary'].map((r, i) => (
                    <span key={r} className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      i === 0 ? 'bg-gray-100 text-gray-600' :
                      i === 1 ? 'bg-blue-100 text-blue-700' :
                      i === 2 ? 'bg-purple-100 text-purple-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{r}</span>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Small card – Routes */}
            <motion.div variants={fadeUp}
              className="group bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-8 overflow-hidden relative">
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-50 rounded-full translate-y-1/2 -translate-x-1/2 opacity-60" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-xl text-gray-900 mb-2">Complete Routes</h3>
                <p className="text-gray-500 leading-relaxed">Follow trails, check in at POIs, earn Route NFTs as on-chain proof of your adventures.</p>
              </div>
            </motion.div>

            {/* Small card – Tokens */}
            <motion.div variants={fadeUp}
              className="group bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-8 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-60" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <h3 className="font-bold text-xl text-gray-900 mb-2">Runner Tokens</h3>
                <p className="text-gray-500 leading-relaxed">Every runner gets a personal bonding curve token. Buy early. When they launch, you profit.</p>
              </div>
            </motion.div>

            {/* Large card – Reputation */}
            <motion.div variants={fadeUp}
              className="md:col-span-2 group bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-8 overflow-hidden relative">
              <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-amber-50 rounded-full opacity-70" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h3 className="font-bold text-xl text-gray-900 mb-2">Reputation & Aura</h3>
                <p className="text-gray-500 leading-relaxed max-w-sm">Every activity — POIs found, routes completed, FriendPasses sold — builds your on-chain reputation score and unlocks your Aura tier.</p>
                <div className="mt-6 flex items-center gap-3">
                  {[
                    { label: 'Explorer', color: 'bg-slate-200' },
                    { label: 'Pacer', color: 'bg-emerald-200' },
                    { label: 'Trailblazer', color: 'bg-blue-200' },
                    { label: 'Legend', color: 'bg-amber-300' },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 ${color} rounded-full shadow-sm`} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          HOW IT WORKS — numbered steps, white
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white px-6 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full border border-gray-200 mb-4">
              Simple to start
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900">How it works</h2>
          </motion.div>

          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { n: 1, title: 'Sign Up', desc: 'Email, Google, or wallet. We create your wallet automatically.', bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', border: 'border-emerald-100' },
              { n: 2, title: 'Explore', desc: 'Discover POIs near you. The rarer the find, the more valuable.', bg: 'bg-blue-50', iconBg: 'bg-blue-500', border: 'border-blue-100' },
              { n: 3, title: 'Run & Earn', desc: 'Complete routes, build reputation, climb the leaderboard.', bg: 'bg-amber-50', iconBg: 'bg-amber-500', border: 'border-amber-100' },
              { n: 4, title: 'Invest', desc: 'Buy runner tokens early on the bonding curve. Profit on launch.', bg: 'bg-purple-50', iconBg: 'bg-purple-500', border: 'border-purple-100' },
            ].map(({ n, title, desc, bg, iconBg, border }, i) => (
              <motion.div key={n} variants={fadeUp}
                className={`relative ${bg} border ${border} rounded-3xl p-6 group hover:-translate-y-1 transition-all duration-300`}>
                <span className="absolute top-4 right-4 text-xs font-mono font-bold text-gray-300">0{n}</span>
                <div className={`w-11 h-11 ${iconBg} rounded-2xl flex items-center justify-center mb-5 shadow-sm`}>
                  {i === 0 && <StepIconSignUp />}
                  {i === 1 && <StepIconExplore />}
                  {i === 2 && <StepIconRun />}
                  {i === 3 && <StepIconInvest />}
                </div>
                <h3 className="font-bold text-base text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          POI RARITY — light cards
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 px-6 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3">POI Rarity System</h2>
            <p className="text-gray-500 text-lg">Not all discoveries are equal.</p>
          </motion.div>

          <motion.div variants={stagger} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Common', pct: '50%', desc: 'Parks, benches, cafes', dotColor: 'bg-slate-400', bg: 'bg-white', border: 'border-gray-200', tag: 'text-gray-500 bg-gray-100' },
              { name: 'Rare', pct: '30%', desc: 'Hidden trails, viewpoints', dotColor: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-100', tag: 'text-blue-700 bg-blue-100' },
              { name: 'Epic', pct: '15%', desc: 'Unique urban gems', dotColor: 'bg-purple-500', bg: 'bg-purple-50', border: 'border-purple-100', tag: 'text-purple-700 bg-purple-100' },
              { name: 'Legendary', pct: '5%', desc: 'Once-in-a-lifetime finds', dotColor: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', tag: 'text-amber-700 bg-amber-100' },
            ].map(({ name, pct, desc, dotColor, bg, border, tag }) => (
              <motion.div key={name} variants={fadeUp}
                className={`${bg} border ${border} rounded-3xl p-6 hover:scale-[1.03] transition-all duration-300 shadow-sm hover:shadow-md`}>
                <div className={`w-10 h-10 ${dotColor} rounded-2xl mb-4 shadow-sm`} />
                <p className="font-bold text-gray-900 mb-1">{name}</p>
                <p className="text-xs text-gray-500 mb-3 leading-snug">{desc}</p>
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${tag}`}>{pct} of slots</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — emerald gradient
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp} viewport={{ once: true }} whileInView="animate" initial="initial"
            className="relative text-center bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 rounded-3xl p-12 md:p-16 overflow-hidden shadow-2xl shadow-emerald-500/20">
            {/* Noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
            {/* Highlight orb */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-white/20 rounded-full blur-[80px]" />

            <div className="relative z-10">
              <img src="/ontrail-logo.png" alt="OnTrail" className="h-8 mx-auto mb-6 brightness-0 invert opacity-80" />
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
                Ready to hit the trail?
              </h2>
              <p className="text-white/80 mb-10 text-lg max-w-xl mx-auto">
                No wallet needed. Sign up with email and start exploring. Your adventure creates real value.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                {isConnected ? (
                  <Link to="/explore"
                    className="bg-white text-emerald-700 px-8 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                    Go to Explorer →
                  </Link>
                ) : (
                  <button onClick={login}
                    className="bg-white text-emerald-700 px-8 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                    Get Started — It's Free
                  </button>
                )}
                <Link to="/tokens"
                  className="border-2 border-white/40 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-white/10 transition-all">
                  Explore Tokens
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-400 py-6 px-6">
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
