import { Routes, Route, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import RoutesPage from './pages/Routes';
import Tokens from './pages/Tokens';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import AuraLeaderboard from './pages/AuraLeaderboard';
import RunnerLanding from './pages/RunnerLanding';
import { resolveRunnerFromSubdomain } from './lib/subdomain';
import { useAuth } from './context/AuthContext';
import AuraToastContainer from './components/AuraToastContainer';

function AdminRoute() {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) return null;
  return isAdmin ? <Admin /> : <Navigate to="/" replace />;
}

export default function App() {
  const runnerUsername = useMemo(
    () => resolveRunnerFromSubdomain(window.location.hostname),
    [],
  );

  // If on a runner subdomain, render the journey landing page (full-bleed, no Layout)
  if (runnerUsername) {
    return (
      <>
        <AuraToastContainer />
        <RunnerLanding />
      </>
    );
  }

  return (
    <>
      <AuraToastContainer />
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/tokens" element={<Tokens />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/leaderboard" element={<AuraLeaderboard />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Route>
    </Routes>
    </>
  );
}
