import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('careerlens-token') || '')
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('careerlens-token')
    setToken('')
    setUser(null)
  }, [])

  const login = useCallback(async (credentials) => {
    const response = await api.post('/auth/login', credentials)
    const nextToken = response.data.token
    const student = response.data.student

    localStorage.setItem('careerlens-token', nextToken)
    setToken(nextToken)
    setUser(student)

    return response.data
  }, [])

  const register = useCallback(async (payload) => {
    const response = await api.post('/auth/register', payload)
    return response.data
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null)
      setLoading(false)
      return null
    }

    try {
      const response = await api.get('/auth/me')
      setUser(response.data.student)
      return response.data.student
    } catch (error) {
      logout()
      return null
    } finally {
      setLoading(false)
    }
  }, [logout, token])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  useEffect(() => {
    const handleAuthExpiry = () => {
      logout()
    }

    window.addEventListener('auth:expired', handleAuthExpiry)
    return () => window.removeEventListener('auth:expired', handleAuthExpiry)
  }, [logout])

  const value = useMemo(() => ({
    user,
    token,
    isAuthenticated: Boolean(token && user),
    login,
    register,
    logout,
    loading,
    refreshUser,
  }), [login, logout, refreshUser, token, user, loading, register])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
