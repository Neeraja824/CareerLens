import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const initialRegisterValues = {
  fullName: '',
  studentId: '',
  email: '',
  phone: '',
  department: '',
  branch: '',
  graduationYear: '',
  password: '',
  confirmPassword: '',
  consent: false,
}

const initialLoginValues = {
  email: '',
  password: '',
}

function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginForm, setLoginForm] = useState(initialLoginValues)
  const [registerForm, setRegisterForm] = useState(initialRegisterValues)
  const [loginErrors, setLoginErrors] = useState({})
  const [registerErrors, setRegisterErrors] = useState({})
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const getErrorMessage = (error, fallback, label = 'Request') => {
    if (error?.response?.data?.message) {
      return `${label} failed: ${error.response.data.message}`
    }

    if (error?.code === 'ERR_NETWORK' || !error?.response) {
      return `${label} failed: Backend server unavailable.`
    }

    return fallback
  }

  const validateRegisterForm = () => {
    const errors = {}

    if (!registerForm.fullName.trim()) errors.fullName = 'Please enter your full name.'
    if (!registerForm.studentId.trim()) errors.studentId = 'Please enter your student ID.'
    if (!registerForm.email.trim()) errors.email = 'Please enter your college email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) errors.email = 'Please enter a valid email address.'
    if (!registerForm.phone.trim()) errors.phone = 'Please enter your phone number.'
    else if (!/^\d{10}$/.test(registerForm.phone.replace(/\D/g, ''))) errors.phone = 'Please enter a valid 10-digit phone number.'
    if (!registerForm.department.trim()) errors.department = 'Please select your department.'
    if (!registerForm.branch.trim()) errors.branch = 'Please select your branch.'
    if (!registerForm.graduationYear.trim()) errors.graduationYear = 'Please enter your graduation year.'
    if (!registerForm.password) errors.password = 'Password is required.'
    else if (registerForm.password.length < 8) errors.password = 'Password must contain at least 8 characters.'
    if (!registerForm.confirmPassword) errors.confirmPassword = 'Please confirm your password.'
    else if (registerForm.password !== registerForm.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
    if (!registerForm.consent) errors.consent = 'You must agree to the terms to continue.'

    return errors
  }

  const validateLoginForm = () => {
    const errors = {}

    if (!loginForm.email.trim()) errors.email = 'Please enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email)) errors.email = 'Please enter a valid email address.'
    if (!loginForm.password) errors.password = 'Please enter your password.'
    return errors
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    const errors = validateLoginForm()
    setLoginErrors(errors)

    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await login({
        email: loginForm.email,
        password: loginForm.password,
      })
      navigate('/dashboard')
    } catch (error) {
      setLoginErrors({
        form: error.response?.data?.message || 'Login failed. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    const errors = validateRegisterForm()
    setRegisterErrors(errors)

    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      const response = await register({
        fullName: registerForm.fullName,
        studentId: registerForm.studentId,
        email: registerForm.email,
        phone: registerForm.phone,
        department: registerForm.department,
        branch: registerForm.branch,
        graduationYear: registerForm.graduationYear,
        password: registerForm.password,
      })

      const successMessage = response?.message || 'Registration successful'
      setRegisterSuccess(successMessage)
      setRegisterErrors({})
      setTimeout(() => {
        navigate('/login', { state: { successMessage } })
      }, 850)
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Registration failed. Please try again.', 'Registration')
      console.error('Registration request failed:', error)
      setRegisterErrors({ form: errorMessage })
      setRegisterSuccess('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand" aria-label="CareerLens AI">
            CareerLens AI
          </div>
          <div className="auth-toggle">
            <Link className={mode === 'login' ? 'active' : ''} to="/login">Login</Link>
            <Link className={mode === 'register' ? 'active' : ''} to="/register">Register</Link>
          </div>
        </div>

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
            <h1>Welcome back</h1>
            <p className="subtle-text">Sign in to continue to your student dashboard.</p>

            {location.state?.successMessage && <div className="success-banner">{location.state.successMessage}</div>}
            {loginErrors.form && <div className="error-banner">{loginErrors.form}</div>}

            <label>
              <span>Email</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                placeholder="name@student.edu"
              />
              {loginErrors.email && <small>{loginErrors.email}</small>}
            </label>

            <label>
              <span>Password</span>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  placeholder="Enter your password"
                />
                <button type="button" className="toggle-password" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {loginErrors.password && <small>{loginErrors.password}</small>}
            </label>

            <div className="auth-actions-row">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Logging in...' : 'Login'}
              </button>
              <button type="button" className="secondary-button">Forgot password</button>
            </div>

            <p className="auth-footnote">Need an account? <Link to="/register">Create one</Link></p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegisterSubmit} noValidate>
            <h1>Create account</h1>
            <p className="subtle-text">Register as a student to access your CareerLens dashboard.</p>

            {registerSuccess && <div className="success-banner">{registerSuccess}</div>}
            {registerErrors.form && <div className="error-banner">{registerErrors.form}</div>}

            <div className="two-column-grid">
              <label>
                <span>Full name</span>
                <input
                  type="text"
                  value={registerForm.fullName}
                  onChange={(event) => setRegisterForm({ ...registerForm, fullName: event.target.value })}
                  placeholder="Full name"
                />
                {registerErrors.fullName && <small>{registerErrors.fullName}</small>}
              </label>

              <label>
                <span>Student ID</span>
                <input
                  type="text"
                  value={registerForm.studentId}
                  onChange={(event) => setRegisterForm({ ...registerForm, studentId: event.target.value })}
                  placeholder="STU2027"
                />
                {registerErrors.studentId && <small>{registerErrors.studentId}</small>}
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                  placeholder="name@student.edu"
                />
                {registerErrors.email && <small>{registerErrors.email}</small>}
              </label>

              <label>
                <span>Phone</span>
                <input
                  type="tel"
                  value={registerForm.phone}
                  onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })}
                  placeholder="9876543210"
                />
                {registerErrors.phone && <small>{registerErrors.phone}</small>}
              </label>

              <label>
                <span>Department</span>
                <input
                  type="text"
                  value={registerForm.department}
                  onChange={(event) => setRegisterForm({ ...registerForm, department: event.target.value })}
                  placeholder="Information Technology"
                />
                {registerErrors.department && <small>{registerErrors.department}</small>}
              </label>

              <label>
                <span>Branch</span>
                <input
                  type="text"
                  value={registerForm.branch}
                  onChange={(event) => setRegisterForm({ ...registerForm, branch: event.target.value })}
                  placeholder="IT"
                />
                {registerErrors.branch && <small>{registerErrors.branch}</small>}
              </label>

              <label>
                <span>Graduation year</span>
                <input
                  type="text"
                  value={registerForm.graduationYear}
                  onChange={(event) => setRegisterForm({ ...registerForm, graduationYear: event.target.value })}
                  placeholder="2027"
                />
                {registerErrors.graduationYear && <small>{registerErrors.graduationYear}</small>}
              </label>
            </div>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                placeholder="At least 8 characters"
              />
              {registerErrors.password && <small>{registerErrors.password}</small>}
            </label>

            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={registerForm.confirmPassword}
                onChange={(event) => setRegisterForm({ ...registerForm, confirmPassword: event.target.value })}
                placeholder="Confirm password"
              />
              {registerErrors.confirmPassword && <small>{registerErrors.confirmPassword}</small>}
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={registerForm.consent}
                onChange={(event) => setRegisterForm({ ...registerForm, consent: event.target.checked })}
              />
              <span>I agree to the terms and confirm that the information provided is accurate.</span>
            </label>
            {registerErrors.consent && <small className="checkbox-error">{registerErrors.consent}</small>}

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Registering...' : 'Create Account'}
            </button>

            <p className="auth-footnote">Already have an account? <Link to="/login">Log in</Link></p>
          </form>
        )}
      </div>
    </div>
  )
}

export default AuthPage
