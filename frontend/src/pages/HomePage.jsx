import { Link } from 'react-router-dom'

function HomePage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand" aria-label="CareerLens AI">
            CareerLens AI
          </div>

          <div className="auth-toggle" aria-label="Main navigation">
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>
        </div>

        <div className="auth-form">
          <p className="eyebrow">CareerLens AI</p>
          <h1>AI-powered resume intelligence for student placement success.</h1>
          <p className="subtle-text">
            CareerLens AI helps students understand resume readiness, identify skill gaps, and move toward better-fit opportunities with a professional placement platform experience.
          </p>

          <div className="auth-actions-row">
            <Link className="primary-button" to="/register">Get Started</Link>
            <Link className="secondary-button" to="/login">Login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
