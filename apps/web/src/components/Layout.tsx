import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Layout() {
  const { t } = useTranslation();
  const { isConnected, wallet, login, logout } = useAuth();

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert('Please install MetaMask to connect.');
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      const { nonce, message } = await api.getChallenge(addr);
      const signature = await (window as any).ethereum.request({
        method: 'personal_sign', params: [message, addr],
      });
      try {
        const { access_token } = await api.login(addr, signature, nonce);
        login(access_token, addr);
      } catch {
        const username = prompt('New user! Choose a username (3-20 chars):');
        if (!username) return;
        const { nonce: n2, message: m2 } = await api.getChallenge(addr);
        const sig2 = await (window as any).ethereum.request({
          method: 'personal_sign', params: [m2, addr],
        });
        const { access_token } = await api.register(addr, sig2, n2, username);
        login(access_token, addr);
      }
    } catch (err: any) {
      alert(err.message || 'Connection failed');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <nav className="bg-ontrail-700 text-white px-6 py-3 flex items-center gap-6 shadow-lg">
        <Link to="/" className="text-xl font-bold tracking-tight">🏃 {t('app.title')}</Link>
        <div className="flex gap-4 ml-auto text-sm">
          <Link to="/explore" className="hover:text-ontrail-50">{t('nav.explore')}</Link>
          <Link to="/routes" className="hover:text-ontrail-50">{t('nav.routes')}</Link>
          <Link to="/tokens" className="hover:text-ontrail-50">{t('nav.tokens')}</Link>
          <Link to="/profile" className="hover:text-ontrail-50">{t('nav.profile')}</Link>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs bg-ontrail-900 px-2 py-1 rounded font-mono">
              {wallet?.slice(0, 6)}...{wallet?.slice(-4)}
            </span>
            <button onClick={logout} className="text-xs hover:text-red-300">Disconnect</button>
          </div>
        ) : (
          <button onClick={connectWallet}
            className="ml-4 bg-white text-ontrail-700 px-3 py-1 rounded text-sm font-medium hover:bg-ontrail-50">
            {t('auth.connect')}
          </button>
        )}
      </nav>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
      <footer className="bg-gray-100 text-center text-xs text-gray-500 py-4">
        OnTrail © 2025 — Web3 Social-Fi for Explorers
      </footer>
    </div>
  );
}
