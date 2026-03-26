import { Routes, Route } from 'react-router-dom';
import { useMemo } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import RoutesPage from './pages/Routes';
import Tokens from './pages/Tokens';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import RunnerLanding from './pages/RunnerLanding';
import { resolveRunnerFromSubdomain } from './lib/subdomain';

export default function App() {
  const runnerUsername = useMemo(
    () => resolveRunnerFromSubdomain(window.location.hostname),
    [],
  );

  // If on a runner subdomain, render the journey landing page (full-bleed, no Layout)
  if (runnerUsername) {
    return <RunnerLanding />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/tokens" element={<Tokens />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
    </Routes>
  );
}
