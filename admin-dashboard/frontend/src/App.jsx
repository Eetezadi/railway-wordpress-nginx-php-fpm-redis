import { SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SitesList from './pages/SitesList.jsx';
import SiteDetail from './pages/SiteDetail.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <SignedOut>
        <div className="auth-container">
          <div className="auth-card">
            <h1 className="auth-title">WP Dashboard</h1>
            <p className="auth-subtitle">Manage your WordPress fleet</p>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/sites" replace />} />
            <Route path="/sites" element={<SitesList />} />
            <Route path="/sites/:id" element={<SiteDetail />} />
          </Routes>
        </Layout>
      </SignedIn>
    </BrowserRouter>
  );
}

function Layout({ children }) {
  return (
    <div className="app">
      <nav className="navbar">
        <a href="/sites" className="nav-brand">WP Dashboard</a>
        <UserButton afterSignOutUrl="/" />
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
