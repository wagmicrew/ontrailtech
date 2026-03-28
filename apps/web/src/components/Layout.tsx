import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ConnectKitButton } from 'connectkit';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

const ExploreIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const RoutesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
  </svg>
);
const TokensIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
);
const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const AdminIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  </svg>
);

const NAV_ITEMS = [
  { path: '/explore', label: 'nav.explore', icon: <ExploreIcon /> },
  { path: '/routes', label: 'nav.routes', icon: <RoutesIcon /> },
  { path: '/tokens', label: 'nav.tokens', icon: <TokensIcon /> },
  { path: '/profile', label: 'nav.profile', icon: <ProfileIcon /> },
];

export default function Layout() {
  const { t } = useTranslation();
  const { isConnected, isLoading, wallet, username, email, avatarUrl, isAdmin, isAncientOwner, login, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    ...NAV_ITEMS,
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: <AdminIcon /> }] : []),
  ];

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Generate avatar color from wallet/username
  const avatarColor = wallet
    ? `hsl(${parseInt(wallet.slice(2, 8), 16) % 360}, 70%, 50%)`
    : '#22c55e';
  const avatarLetter = username?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-green-50/30">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-100 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/ontrail-logo.png" alt="OnTrail" className="h-6 opacity-90" />
          </Link>

          <div className="hidden md:flex items-center gap-1 ml-8">
            {navItems.map(({ path, label, icon }) => (
              <Link key={path} to={path}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium leading-none transition-all ${
                  location.pathname === path
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
                <span className="translate-y-[1px]">{label.startsWith('nav.') ? t(label) : label}</span>
              </Link>
            ))}
          </div>

          {/* Auth section */}
          <div className="ml-auto flex items-center gap-3">
            {isLoading ? (
              <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
            ) : isConnected ? (
              /* Avatar dropdown */
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(!menuOpen)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow-md hover:ring-green-300 transition-all"
                  style={{ backgroundColor: avatarColor }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile avatar" className="w-full h-full rounded-full object-cover" />
                  ) : avatarLetter}
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
                    >
                      {/* Profile header */}
                      <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: avatarColor }}>
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="Profile avatar" className="w-full h-full rounded-full object-cover" />
                            ) : avatarLetter}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{username || 'Runner'}</p>
                            <p className="text-xs text-gray-500 truncate">{email || ''}</p>
                          </div>
                        </div>
                        {username && (
                          <p className="text-xs text-green-600 mt-2 font-mono">{username}.ontrail.tech</p>
                        )}
                      </div>

                      {/* Wallet section */}
                      <div className="p-3 border-b border-gray-100">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Wallet</p>
                        {wallet ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-gray-50 px-2 py-1 rounded flex-1 truncate">
                              {wallet}
                            </span>
                            <button onClick={() => { navigator.clipboard.writeText(wallet); }}
                              className="text-xs text-green-600 hover:text-green-700 shrink-0">
                              Copy
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No wallet connected</p>
                        )}
                        <ConnectKitButton.Custom>
                          {({ show }) => (
                            <button onClick={() => { show?.(); setMenuOpen(false); }}
                              className="mt-2 w-full text-xs bg-gray-50 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-center">
                              {wallet ? 'Manage Wallet' : 'Connect External Wallet'}
                            </button>
                          )}
                        </ConnectKitButton.Custom>
                      </div>

                      {/* Menu items */}
                      <div className="p-2">
                        <MenuLink to="/profile" icon={<ProfileIcon />} label="My Profile" onClick={() => setMenuOpen(false)} />
                        <MenuLink to="/explore" icon={<ExploreIcon />} label="Explore POIs" onClick={() => setMenuOpen(false)} />
                        <MenuLink to="/tokens" icon={<TokensIcon />} label="My Tokens" onClick={() => setMenuOpen(false)} />
                        {isAdmin && (
                          <MenuLink to="/admin" icon={<AdminIcon />} label={isAncientOwner ? 'Ancient Dashboard' : 'Admin Dashboard'} onClick={() => setMenuOpen(false)} />
                        )}
                      </div>

                      {/* Roles badge */}
                      {isAncientOwner && (
                        <div className="px-4 py-2 border-t border-gray-100">
                          <span className="text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 rounded-full font-medium">
                            Ancient Owner
                          </span>
                        </div>
                      )}

                      {/* Sign out */}
                      <div className="p-2 border-t border-gray-100">
                        <button onClick={() => { logout(); setMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition">
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Not connected */
              <div className="flex items-center gap-2">
                <button onClick={login}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-green-500/25 transition-all">
                  Get Started
                </button>
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button onClick={show}
                      className="hidden md:block border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                      Connect Wallet
                    </button>
                  )}
                </ConnectKitButton.Custom>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            className={location.pathname === '/' ? '' : 'max-w-7xl mx-auto px-6 py-8'}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-2 py-2 z-50">
        <div className="flex justify-around">
          {NAV_ITEMS.map(({ path, icon }) => (
            <Link key={path} to={path}
              className={`p-2 rounded-lg ${location.pathname === path ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>
              {icon}
            </Link>
          ))}
        </div>
      </nav>

      <footer className={`hidden md:block bg-white/50 border-t border-gray-100 text-xs text-gray-400 py-6 ${location.pathname === '/' ? '!hidden' : ''}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <p>OnTrail — Web3 SocialFi for Explorers • Built on Base</p>
          <ExpoQRFooter />
        </div>
      </footer>
    </div>
  );
}

function MenuLink({ to, icon, label, onClick }: { to: string; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 text-sm leading-none text-gray-700 hover:bg-gray-50 rounded-lg transition">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-gray-500">{icon}</span>
      <span className="translate-y-[1px]">{label}</span>
    </Link>
  );
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

function ExpoQRFooter() {
  const [expoUrl, setExpoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/expo/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.running && data.url) {
          setExpoUrl(data.url);
        }
      } catch {
        // Expo status unavailable — don't show QR
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!expoUrl) return null;

  return (
    <div className="hidden md:flex items-center gap-4">
      <QRCodeSVG
        value={expoUrl}
        size={120}
        level="M"
        bgColor="transparent"
        fgColor="#374151"
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-600">Try the mobile app</span>
        <a
          href={expoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:text-green-700 transition-colors"
        >
          expo.ontrail.tech
        </a>
      </div>
    </div>
  );
}
