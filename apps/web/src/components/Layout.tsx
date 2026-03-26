import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ConnectKitButton } from 'connectkit';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/explore', label: 'nav.explore', icon: '🗺️' },
  { path: '/routes', label: 'nav.routes', icon: '🏃' },
  { path: '/tokens', label: 'nav.tokens', icon: '📈' },
  { path: '/profile', label: 'nav.profile', icon: '👤' },
];

export default function Layout() {
  const { t } = useTranslation();
  const { isConnected, isLoading, wallet, isAdmin, isAncientOwner, login, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    ...NAV_ITEMS,
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-green-50/30">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-100 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-2xl">🏃</span>
            <span className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
              {t('app.title')}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 ml-8">
            {navItems.map(({ path, label, icon }) => (
              <Link key={path} to={path}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  location.pathname === path
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>
                <span className="mr-1">{icon}</span> {label.startsWith('nav.') ? t(label) : label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {isLoading ? (
              <div className="w-24 h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : isConnected ? (
              <div className="flex items-center gap-2">
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button onClick={show}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg font-mono hover:bg-gray-200 transition">
                      {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Wallet'}
                    </button>
                  )}
                </ConnectKitButton.Custom>
                <button onClick={logout}
                  className="text-xs text-gray-500 hover:text-red-500 transition px-2 py-2">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={login}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-green-500/25 transition-all">
                  Get Started
                </button>
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button onClick={show}
                      className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                      Connect Wallet
                    </button>
                  )}
                </ConnectKitButton.Custom>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page content with animation */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="max-w-7xl mx-auto px-6 py-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-2 py-2 z-50">
        <div className="flex justify-around">
          {NAV_ITEMS.map(({ path, icon }) => (
            <Link key={path} to={path}
              className={`p-2 rounded-lg text-xl ${location.pathname === path ? 'bg-green-50' : ''}`}>
              {icon}
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <footer className="hidden md:block bg-white/50 border-t border-gray-100 text-center text-xs text-gray-400 py-6">
        <p>OnTrail — Web3 SocialFi for Explorers • Built on Base</p>
      </footer>
    </div>
  );
}
