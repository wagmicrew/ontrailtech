import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import RoutesPage from './pages/Routes';
import Tokens from './pages/Tokens';
import Profile from './pages/Profile';
import Admin from './pages/Admin';

export default function App() {
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
