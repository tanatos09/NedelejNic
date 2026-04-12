import { useState, FormEvent } from 'react';
import { api } from '../services/api';
import type { User } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

type Mode = 'login' | 'register';

export default function AuthPage({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password);
      onLogin(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Neznámá chyba.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>NedelejNic</h1>
        <p style={styles.subtitle}>
          {mode === 'login'
            ? 'Přihlaš se a nic nedělej.'
            : 'Registruj se a nic nedělej.'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Uživatelské jméno"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading
              ? 'Moment...'
              : mode === 'login'
              ? 'Přihlásit se'
              : 'Registrovat se'}
          </button>
        </form>

        <button style={styles.switchBtn} type="button" onClick={switchMode}>
          {mode === 'login'
            ? 'Nemáš účet? Registruj se.'
            : 'Máš účet? Přihlaš se.'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  card: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    padding: '40px',
    width: '100%',
    maxWidth: '360px',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    marginBottom: '8px',
    color: '#fff',
    letterSpacing: '3px',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: '#444',
    fontSize: '13px',
    marginBottom: '28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
    padding: '10px 14px',
    outline: 'none',
    width: '100%',
  },
  error: {
    color: '#ff5555',
    fontSize: '13px',
  },
  button: {
    backgroundColor: '#fff',
    border: 'none',
    borderRadius: '4px',
    color: '#000',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    marginTop: '4px',
    padding: '12px',
    transition: 'opacity 0.15s',
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    color: '#3a3a3a',
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '16px',
    textDecoration: 'underline',
    display: 'block',
    width: '100%',
    textAlign: 'center',
  },
};
