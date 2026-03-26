import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Layout() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-ontrail-700 text-white px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-xl font-bold tracking-tight">
          {t('app.title')}
        </Link>
        <div className="flex gap-4 ml-auto text-sm">
          <Link to="/explore" className="hover:text-ontrail-50">{t('nav.explore')}</Link>
          <Link to="/routes" className="hover:text-ontrail-50">{t('nav.routes')}</Link>
          <Link to="/tokens" className="hover:text-ontrail-50">{t('nav.tokens')}</Link>
          <Link to="/profile" className="hover:text-ontrail-50">{t('nav.profile')}</Link>
        </div>
        <button className="ml-4 bg-white text-ontrail-700 px-3 py-1 rounded text-sm font-medium">
          {t('auth.connect')}
        </button>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
