import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import PublicRoute from './components/PublicRoute.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ResumePage from './pages/ResumePage.jsx'
import './App.css'

function AppShell() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<PublicRoute><AuthPage mode="login" /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><AuthPage mode="register" /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/resume" element={<ProtectedRoute><ResumePage /></ProtectedRoute>} />
      <Route path="/jobs" element={<ProtectedRoute><div className="placeholder-page"><h1>Jobs</h1><p>Job discovery will be added in a later phase.</p></div></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><div className="placeholder-page"><h1>Applications</h1><p>Application tracking will be added in a later phase.</p></div></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
