import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="text-neon-green text-2xl font-mono mb-4 animate-pulse">
            HACKER509
          </div>
          <div className="text-text-muted text-sm font-mono tracking-widest">
            AUTHENTICATING...
          </div>
          <div className="mt-4 flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-neon-green rounded-full"
                style={{
                  animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                  boxShadow: '0 0 6px #00ff66',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin()) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <div className="card-cyber neon-border-danger rounded p-8 max-w-md w-full text-center">
          <div className="text-neon-danger text-4xl mb-4">⛔</div>
          <div className="text-neon-danger text-xl font-mono font-bold mb-2">ACCESS DENIED</div>
          <div className="text-text-muted text-sm font-mono">
            ADMIN CLEARANCE REQUIRED FOR THIS SECTOR
          </div>
          <button
            onClick={() => window.history.back()}
            className="btn-cyber mt-6 px-6 py-2 text-sm rounded"
          >
            ← RETURN
          </button>
        </div>
      </div>
    )
  }

  return children
}
