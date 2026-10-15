import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DialerProvider } from './contexts/DialerContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Navbar from './components/Navbar.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Dialer from './pages/Dialer.jsx'
import Contacts from './pages/Contacts.jsx'
import CallHistory from './pages/CallHistory.jsx'
import Settings from './pages/Settings.jsx'
import UserManagement from './pages/UserManagement.jsx'
import IncomingTransferModal from './components/IncomingTransferModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      <IncomingTransferModal />
    </div>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="card-cyber rounded p-8 max-w-md w-full text-center">
        <div className="text-neon-danger text-4xl mb-4">⚠</div>
        <div className="text-neon-danger text-xl font-mono font-bold mb-2">PAGE NOT FOUND</div>
        <div className="text-text-muted text-sm font-mono mb-6">
          The route you requested does not exist.
        </div>
        <a href="#/" className="btn-cyber inline-block px-6 py-2 text-sm rounded">
          ← RETURN HOME
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <DialerProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dialer"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dialer />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/contacts"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Contacts />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CallHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute adminOnly>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute adminOnly>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DialerProvider>
      </AuthProvider>
    </HashRouter>
  )
}
