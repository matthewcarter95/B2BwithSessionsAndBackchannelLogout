import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect } from 'react';
import Profile from '../components/Profile';
import SessionList from '../components/SessionList';
import SessionDetail from '../components/SessionDetail';
import { useSessions } from '../hooks/useSession';

export default function Dashboard() {
  const { user, logout } = useAuth0();

  // Start session polling globally (monitors for backchannel logout)
  // This runs regardless of which page user is on
  useSessions(user?.sub);

  // Log when polling starts
  useEffect(() => {
    if (user?.sub) {
      console.log('🔄 Global session polling started for user:', user.sub);
      console.log('📡 Polling every 30 seconds to detect backchannel logout');
    }
  }, [user?.sub]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Bar */}
      <nav style={{
        background: '#1a73e8',
        color: 'white',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>B2B App</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/profile" style={{ color: 'white' }}>Profile</Link>
            <Link to="/sessions" style={{ color: 'white' }}>Sessions</Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>{user?.email}</span>
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid white' }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container" style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/profile" replace />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/sessions" element={<SessionList />} />
          <Route path="/sessions/:sid" element={<SessionDetail />} />
        </Routes>
      </div>
    </div>
  );
}
