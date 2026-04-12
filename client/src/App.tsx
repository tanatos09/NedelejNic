import { useState, useEffect } from 'react';
import AuthPage from './pages/AuthPage';
import GamePage from './pages/GamePage';
import { api } from './services/api';
import type { User } from './types';

function isMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
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
        }}
      >
        <span style={{ color: '#333', fontSize: '14px' }}>Načítám...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={setUser} />;
  }

  return (
    <GamePage
      user={user}
      onLevelChange={(newLevel) =>
        setUser((prev) => (prev ? { ...prev, level: newLevel } : prev))
      }
    />
  );
}
