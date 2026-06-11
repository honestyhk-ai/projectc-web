import { HashRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import AuthGate from "./auth/AuthGate";
import { supabase } from "./lib/supabase";
import Search from "./pages/Search";
import Profile from "./pages/Profile";
import GameDetail from "./pages/GameDetail";
import IpSearch from "./pages/IpSearch";
import Ranking from "./pages/Ranking";

function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="logo">
        ProjectC <span className="muted">전적</span>
      </Link>
      <nav className="nav">
        <Link to="/" className="navlink">플레이어</Link>
        <Link to="/ranking" className="navlink">순위</Link>
        <Link to="/ip" className="navlink">IP 검색</Link>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          로그아웃
        </button>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthGate>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/ip" element={<IpSearch />} />
            <Route path="/player/:ano" element={<Profile />} />
            <Route path="/game/:gameId" element={<GameDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </AuthGate>
    </HashRouter>
  );
}
