import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';

// Placeholder components (will be implemented later)
function Profile() {
  const { user } = useAuth0();
  return (
    <div className="card">
      <h2>Profile</h2>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}

function Sessions() {
  return (
    <div className="card">
      <h2>Sessions</h2>
      <p>Session list will be implemented here</p>
    </div>
  );
}

function SessionDetail() {
  return (
    <div className="card">
      <h2>Session Detail</h2>
      <p>Session details will be shown here</p>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth0();

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
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:sid" element={<SessionDetail />} />
        </Routes>
      </div>
    </div>
  );
}
