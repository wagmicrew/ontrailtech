import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const platformStats = [
  { value: '12.4k+', label: 'POIs verified', accent: 'border-emerald-400/30 bg-gradient-to-br from-emerald-400/20 via-emerald-400/10 to-white/20' },
  { value: '3.8k+', label: 'Active runners', accent: 'border-sky-400/30 bg-gradient-to-br from-sky-400/20 via-cyan-400/10 to-white/20' },
  { value: '€140k+', label: 'Token volume', accent: 'border-violet-400/30 bg-gradient-to-br from-violet-400/20 via-fuchsia-400/10 to-white/20' },
  { value: '98k+', label: 'Routes completed', accent: 'border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-orange-300/10 to-white/20' },
];

interface TopRunner {
  runnerId: string;
  username: string;
  avatar_url?: string | null;
  totalAura: string;
  auraLevel: string;
  ancientSupporterCount: number;
  rank?: number;
  handle?: string;
  price?: string;
  friendPass?: string;
  status?: string;
}

const featureCards = [
  {
    title: 'Verified outdoor activity',
    desc: 'Turn real movement, routes, and visits into reputation that can be tracked and trusted.',
    accent: 'from-emerald-500/15 to-teal-500/5',
    icon: 'bg-emerald-500',
    img: '/verified-activity-icon.png',
  },
  {
    title: 'Professional creator profiles',
    desc: 'Give each runner a digital home with identity, milestones, and performance-backed social proof.',
    accent: 'from-sky-500/15 to-cyan-500/5',
    icon: 'bg-sky-500',
    img: '/creator-profiles-icon.png',
  },
  {
    title: 'Tokenized community upside',
    desc: 'Support emerging athletes early through transparent bonding-curve launches and on-chain rewards.',
    accent: 'from-violet-500/15 to-fuchsia-500/5',
    icon: 'bg-violet-500',
    img: '/tokenized-community-icon.png',
  },
];

const workflow = [
  {
    step: '01',
    title: 'Join in minutes',
    desc: 'Create an account with email or wallet and get access to your trail identity instantly.',
  },
  {
    step: '02',
    title: 'Move and verify',
    desc: 'Log routes, discover POIs, and sync fitness activity to build real-world proof of effort.',
  },
  {
    step: '03',
    title: 'Earn visibility',
    desc: 'Climb the leaderboard, unlock aura tiers, and participate in creator-backed launches.',
  },
];

export default function Home() {
  const { isConnected, login } = useAuth();
  const [topRunners, setTopRunners] = useState<TopRunner[]>([]);
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getRunnerLeaderboard()
      .then((d: any) => {
        const list: TopRunner[] = (d?.runners ?? d ?? []).slice(0, 10);
        setTopRunners(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (topRunners.length < 2) return;
    timerRef.current = setInterval(() => {
      setDirection(1);
      setFeaturedIdx((i) => (i + 1) % topRunners.length);
    }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [topRunners]);

  const goTo = (idx: number) => {
    setDirection(idx > featuredIdx ? 1 : -1);
    setFeaturedIdx(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDirection(1);
      setFeaturedIdx((i) => (i + 1) % topRunners.length);
    }, 4000);
  };

  const runner = topRunners[featuredIdx];

  return (
    <div className="bg-white text-slate-900">
      <section className="relative isolate flex min-h-[calc(100vh-72px)] items-center overflow-hidden bg-slate-100 px-6 pb-12 pt-8 sm:pt-10 lg:px-8 lg:pb-12">
        <div className="absolute inset-0">
          <img src="/hero26.png" alt="" aria-hidden="true" className="h-full w-full object-cover object-[center_24%] opacity-100" />
          <div className="absolute inset-0 bg-[linear-gradient(108deg,rgba(248,250,252,0.78)_0%,rgba(255,255,255,0.52)_38%,rgba(236,253,245,0.22)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.1),transparent_28%)]" />
        </div>
        <ShapeHero />

        <div className="relative z-10 mx-auto max-w-7xl w-full">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="grid items-center gap-8 lg:grid-cols-[1.08fr_.92fr]"
          >
            <motion.div variants={fadeUp} className="relative overflow-hidden rounded-[32px] border border-white/60 bg-white/22 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8 lg:p-10">
              <PanelTrailFlow />

              <motion.h1 variants={fadeUp} className="relative max-w-3xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                The runner is back at the center of the story.
                <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-500 bg-clip-text text-transparent">
                  Discover, verify, and grow with every trail.
                </span>
              </motion.h1>

              <motion.p variants={fadeUp} className="relative mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
                OnTrail helps athletes, organizers, and supporters turn verified movement into reputation, discovery, and community-backed value.
              </motion.p>

              <motion.div variants={fadeUp} className="relative mt-8 flex flex-wrap gap-3">
                {isConnected ? (
                  <Link
                    to="/explore"
                    className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-500"
                  >
                    Open platform
                  </Link>
                ) : (
                  <button
                    onClick={login}
                    className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-500"
                  >
                    Get started
                  </button>
                )}

                <Link
                  to="/tokens"
                  className="rounded-2xl border border-slate-200/80 bg-white/55 px-6 py-3 text-sm font-semibold text-slate-700 backdrop-blur transition hover:border-emerald-300 hover:bg-white/70"
                >
                  View token market
                </Link>
              </motion.div>

              <motion.div variants={fadeUp} className="relative mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                {platformStats.map((item) => (
                  <div key={item.label} className={`rounded-2xl border px-4 py-4 shadow-sm backdrop-blur-md bg-white/18 ${item.accent}`}>
                    <div className="text-xl font-bold text-slate-900 sm:text-2xl">{item.value}</div>
                    <div className="mt-1 text-xs text-slate-600">{item.label}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div variants={fadeUp} className="relative">
              <div className="rounded-[30px] border border-white/60 bg-white/20 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl xl:p-5">
                <div className="rounded-[24px] border border-white/70 bg-white/24 p-5 backdrop-blur-xl overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Featured runner</p>
                    {topRunners.length > 1 && (
                      <span className="text-xs text-slate-400 tabular-nums">{featuredIdx + 1} / {topRunners.length}</span>
                    )}
                  </div>

                  <AnimatePresence mode="wait" custom={direction}>
                    {runner ? (
                      <motion.div
                        key={runner.runnerId}
                        custom={direction}
                        initial={{ opacity: 0, x: direction * 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction * -40 }}
                        transition={{ duration: 0.38, ease: 'easeInOut' }}
                      >
                        <div className="mt-4 flex items-center gap-4">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/80 shadow-lg shadow-slate-900/10">
                            <FeaturedRunnerAvatar
                              src={runner.avatar_url ?? ''}
                              name={runner.username}
                            />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold text-slate-900 capitalize">{runner.username}</h2>
                            <p className="text-sm text-slate-600">@{runner.username} · {runner.auraLevel} aura</p>
                          </div>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-slate-700">
                          Live OnTrail profile with public rank, aura level, and open supporter access.
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-500/10 p-4 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Standing</p>
                            <p className="mt-2 text-lg font-bold text-slate-900">Rank #{featuredIdx + 1}</p>
                            <p className="mt-1 text-xs text-slate-600">{runner.username}.ontrail.tech</p>
                          </div>
                          <div className="rounded-2xl border border-sky-200/80 bg-sky-500/10 p-4 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Aura score</p>
                            <p className="mt-2 text-lg font-bold text-slate-900">{parseFloat(runner.totalAura).toFixed(1)}</p>
                            <p className="mt-1 text-xs text-slate-600">{runner.ancientSupporterCount} Ancient supporter{runner.ancientSupporterCount !== 1 ? 's' : ''}</p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <Link
                            to={`/profile?runner=${runner.username}`}
                            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            View profile
                          </Link>
                          <Link to="/leaderboard" className="rounded-2xl border border-slate-200 bg-white/55 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/70">
                            View leaderboard
                          </Link>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="h-16 w-16 rounded-2xl bg-slate-200 animate-pulse shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-5 w-32 rounded-lg bg-slate-200 animate-pulse" />
                            <div className="h-3 w-24 rounded-lg bg-slate-100 animate-pulse" />
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {topRunners.length > 1 && (
                    <div className="mt-4 flex justify-center gap-1.5">
                      {topRunners.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i)}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === featuredIdx
                              ? 'w-5 bg-emerald-600'
                              : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                          }`}
                          aria-label={`Go to runner ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50 px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div initial="initial" whileInView="animate" viewport={{ once: true }} variants={stagger} className="grid gap-4 md:grid-cols-3">
            {featureCards.map((card) => (
              <motion.div
                key={card.title}
                variants={fadeUp}
                className={`rounded-3xl border border-slate-200/80 bg-gradient-to-br ${card.accent} p-6 shadow-sm shadow-slate-200/60`}
              >
                <div className="flex items-start gap-4">
                  {'img' in card && card.img ? (
                    <div className="shrink-0 h-20 w-20 rounded-2xl overflow-hidden shadow-md">
                      <img src={card.img} alt={card.title} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className={`shrink-0 h-20 w-20 rounded-2xl ${card.icon}`} />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-[32px] shadow-[0_32px_80px_rgba(15,23,42,0.18)]"
          >
            <img
              src="/operating-model-banner.png"
              alt="OnTrail operating model — join, move, earn"
              className="w-full h-auto object-cover"
            />
          </motion.div>
        </div>
      </section>

      <section className="bg-slate-950 px-6 py-20 text-white lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm font-semibold text-emerald-300">Why teams choose OnTrail</p>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl">A site that now feels investor-ready and customer-ready</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  'Clear product messaging and stronger trust signals',
                  'Modern hero visuals inspired by structured background paths',
                  'Application-style surfaces for metrics and workflow',
                  'Consistent premium color system across the experience',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-400/20 bg-gradient-to-br from-emerald-500 to-teal-500 p-[1px] shadow-xl shadow-emerald-500/10">
              <div className="h-full rounded-[27px] bg-slate-950 p-6">
                <p className="text-sm font-semibold text-emerald-300">Ready to launch</p>
                <h3 className="mt-2 text-2xl font-bold">Professional frontend refresh complete</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  The new landing presentation is designed to feel credible for athletes, brands, and community investors from the first screen.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {isConnected ? (
                    <Link to="/explore" className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-50">
                      Enter app
                    </Link>
                  ) : (
                    <button onClick={login} className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-50">
                      Create account
                    </button>
                  )}
                  <Link to="/leaderboard" className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5">
                    View leaderboard
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function FeaturedRunnerAvatar({ src, name }: { src: string; name: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (imageFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-sky-500 text-lg font-bold text-white">
        {initials}
      </div>
    );
  }

  return <img src={src} alt={name} className="h-full w-full object-cover" onError={() => setImageFailed(true)} />;
}

function PanelTrailFlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_34%)]" />
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-35" viewBox="0 0 900 620" fill="none" preserveAspectRatio="none">
        <path d="M-40 116C104 54 203 178 334 164C468 150 540 68 686 78C773 84 847 115 948 170" stroke="url(#panelPathA)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M-56 302C86 232 214 360 346 348C478 336 564 238 700 244C788 248 862 278 952 326" stroke="url(#panelPathB)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M42 520C188 454 298 530 430 506C566 482 658 388 802 392C861 394 909 405 958 428" stroke="url(#panelPathC)" strokeWidth="1.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="panelPathA" x1="-40" y1="116" x2="948" y2="170" gradientUnits="userSpaceOnUse">
            <stop stopColor="transparent" />
            <stop offset="0.18" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="0.5" stopColor="#86efac" />
            <stop offset="0.82" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="1" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="panelPathB" x1="-56" y1="302" x2="952" y2="326" gradientUnits="userSpaceOnUse">
            <stop stopColor="transparent" />
            <stop offset="0.2" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="0.5" stopColor="#6ee7b7" />
            <stop offset="0.8" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="1" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="panelPathC" x1="42" y1="520" x2="958" y2="428" gradientUnits="userSpaceOnUse">
            <stop stopColor="transparent" />
            <stop offset="0.2" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="0.52" stopColor="#7dd3fc" />
            <stop offset="0.84" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="1" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function ShapeHero() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[8%] top-24 h-24 w-24 rounded-full bg-emerald-500/10 blur-xl" />
      <div className="absolute bottom-10 right-[7%] h-28 w-28 rounded-full border border-white/10 bg-white/5" />
    </div>
  );
}
