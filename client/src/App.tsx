import { useState, useEffect } from 'react';
import AuthPage from './pages/AuthPage';
import GamePage from './pages/GamePage';
import { AdminDashboard } from './pages/AdminDashboard';
import { api } from './services/api';
import { setOnUnauthorizedHandler } from './services/httpClient';
import { useAdminStore } from './store/adminStore';
import type { User } from './types';

function setupUnauthorizedHandler(handleLogout: () => void) {
  setOnUnauthorizedHandler(() => {
    handleLogout();
  });
}

function isMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
  );
}

type AppPage = 'auth' | 'game' | 'admin';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<AppPage>('auth');

  useEffect(() => {
    setupUnauthorizedHandler(() => {
      setUser(null);
      setCurrentPage('auth');
      useAdminStore.getState().logout();
    });
  }, []);

  useEffect(() => {
    api
      .me()
      .then((userData) => {
        setUser(userData);
        setCurrentPage(userData.role === 'ADMIN' || userData.role === 'DEV' ? 'admin' : 'game');
      })
      .catch(() => {
        setUser(null);
        setCurrentPage('auth');
      })
      .finally(() => setLoading(false));
  }, []);

  if (isMobile()) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#fff', fontSize: '18px', marginBottom: '12px' }}>
          NedelejNic je jen pro desktop.
        </p>
        <p style={{ color: '#555', fontSize: '14px' }}>
          Otevři hru na počítači.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
        }}
      >
        <span style={{ color: '#333', fontSize: '14px' }}>Načítám...</span>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <AuthPage
        onLogin={(u) => {
          setUser(u);
          setCurrentPage(u.role === 'ADMIN' || u.role === 'DEV' ? 'admin' : 'game');
        }}
      />
    );
  }

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setCurrentPage('auth');
    useAdminStore.getState().logout();
  };

  const canAccessAdmin = user.role === 'ADMIN' || user.role === 'DEV';

  const handleAccessAdmin = () => {
    if (canAccessAdmin) {
      setCurrentPage('admin');
    }
  };

  const handleBackFromAdmin = () => {
    setCurrentPage('game');
  };

  // Admin dashboard — ADMIN/DEV
  if (currentPage === 'admin' && canAccessAdmin) {
    return <AdminDashboard onBack={handleBackFromAdmin} />;
  }

  // Game page (PLAYER, DEV, ADMIN — each sees appropriate UI)
  return (
    <GamePage
      user={user}
      onLogout={handleLogout}
      onAdmin={canAccessAdmin ? handleAccessAdmin : undefined}
    />
  );
}
