import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const API_BASE = 'http://localhost:8000'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
})

// Decode JWT payload (without verification)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload))
    return decoded
  } catch {
    return null
  }
}

function isTokenExpired(token) {
  const decoded = decodeToken(token)
  if (!decoded || !decoded.exp) return true
  return decoded.exp * 1000 < Date.now()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('h509_token'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Set up axios interceptor
  useEffect(() => {
    const reqInterceptor = api.interceptors.request.use((config) => {
      const t = localStorage.getItem('h509_token')
      if (t) config.headers.Authorization = `Bearer ${t}`
      return config
    })

    const resInterceptor = api.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err.response?.status === 401) {
          // Try to refresh
          const refreshToken = localStorage.getItem('h509_refresh')
          if (refreshToken) {
            try {
              const res = await axios.post(`${API_BASE}/api/auth/refresh/`, { refresh: refreshToken })
              const newToken = res.data.access
              localStorage.setItem('h509_token', newToken)
              api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
              err.config.headers['Authorization'] = `Bearer ${newToken}`
              return api.request(err.config)
            } catch {
              logout()
            }
          } else {
            logout()
          }
        }
        return Promise.reject(err)
      }
    )

    return () => {
      api.interceptors.request.eject(reqInterceptor)
      api.interceptors.response.eject(resInterceptor)
    }
  }, [])

  // Initialize user from stored token
  useEffect(() => {
    const storedToken = localStorage.getItem('h509_token')
    if (storedToken && !isTokenExpired(storedToken)) {
      const decoded = decodeToken(storedToken)
      if (decoded) {
        setUser({
          username: decoded.username || decoded.user_id || 'operator',
          role: decoded.role || decoded.is_staff ? 'admin' : 'operator',
          id: decoded.user_id,
        })
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      }
    } else if (storedToken) {
      // Token expired, try refresh
      const refreshToken = localStorage.getItem('h509_refresh')
      if (refreshToken) {
        axios.post(`${API_BASE}/api/auth/refresh/`, { refresh: refreshToken })
          .then((res) => {
            const newToken = res.data.access
            localStorage.setItem('h509_token', newToken)
            const decoded = decodeToken(newToken)
            if (decoded) {
              setUser({
                username: decoded.username || 'operator',
                role: decoded.role || (decoded.is_staff ? 'admin' : 'operator'),
                id: decoded.user_id,
              })
            }
          })
          .catch(() => {
            localStorage.removeItem('h509_token')
            localStorage.removeItem('h509_refresh')
          })
          .finally(() => setLoading(false))
        return
      } else {
        localStorage.removeItem('h509_token')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password) => {
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login/`, { username, password })
      const { access, refresh, user: apiUser } = res.data
      localStorage.setItem('h509_token', access)
      if (refresh) localStorage.setItem('h509_refresh', refresh)

      const decoded = decodeToken(access)
      const userData = apiUser || {
        username: decoded?.username || username,
        role: decoded?.role || (decoded?.is_staff ? 'admin' : 'operator'),
        id: decoded?.user_id,
      }
      setUser(userData)
      setToken(access)
      api.defaults.headers.common['Authorization'] = `Bearer ${access}`
      return { success: true }
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Authentication failed'
      setError(msg)
      return { success: false, error: msg }
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('h509_token')
    localStorage.removeItem('h509_refresh')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setToken(null)
  }, [])

  const isAdmin = useCallback(() => {
    return user?.role === 'admin'
  }, [user])

  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout, isAdmin, isAuthenticated, api }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { api }
