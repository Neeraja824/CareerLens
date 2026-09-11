import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

function DashboardPage() {
  const { user, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [resumes, setResumes] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [profileResponse, resumesResponse] = await Promise.all([
          api.get('/students/me'),
          api.get('/resumes/me'),
        ])

        setProfile(profileResponse.data.student || null)
        setResumes(Array.isArray(resumesResponse.data.resumes) ? resumesResponse.data.resumes : [])
      } catch (error) {
        console.error('Dashboard fetch failed:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const currentResume = useMemo(
    () => resumes.find((resume) => resume.isCurrent) || resumes[0] || null,
    [resumes],
  )

  const profileCompletion = useMemo(() => {
    if (!profile) {
      return 0
    }

    const fields = [
      profile.fullName,
      profile.studentId,
      profile.email,
      profile.phone,
      profile.department,
      profile.branch,
      profile.graduationYear,
      profile.education,
      profile.skills,
      profile.careerInterests,
      profile.preferredJobRoles,
      profile.preferredLocations,
    ]

    const filledFields = fields.filter((field) => {
      if (Array.isArray(field)) {
        return field.length > 0
      }

      return String(field || '').trim().length > 0
    }).length

    return Math.round((filledFields / fields.length) * 100)
  }, [profile])

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  if (isLoading) {
    return <div className="page-loading">Loading dashboard...</div>
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">CareerLens AI</div>
        </div>

        <nav className="sidebar-nav">
          <Link className="nav-item active" to="/dashboard">Dashboard</Link>
          <Link className="nav-item" to="/profile">Profile</Link>
          <Link className="nav-item" to="/resume">Resume</Link>
          <Link className="nav-item" to="/jobs">Jobs</Link>
          <Link className="nav-item" to="/applications">Applications</Link>
        </nav>

        <div className="user-menu">
          <div className="user-name">{user?.fullName || 'Student'}</div>
          <Link to="/profile">Profile</Link>
          <button type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Student portal</p>
            <h1>Welcome back, {user?.fullName || 'Student'}</h1>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <span>Profile completion</span>
            <strong>{profileCompletion}%</strong>
          </article>
          <article className="stat-card">
            <span>Resume status</span>
            <strong>{currentResume ? 'Uploaded' : 'Not uploaded'}</strong>
          </article>
          <article className="stat-card">
            <span>Skills</span>
            <strong>{Array.isArray(profile?.skills) ? profile.skills.length : 0}</strong>
          </article>
          <article className="stat-card">
            <span>Recommended jobs</span>
            <strong>Coming soon</strong>
          </article>
          <article className="stat-card">
            <span>Applications</span>
            <strong>0</strong>
          </article>
        </section>

        <section className="dashboard-resume-panel profile-panel">
          <div className="resume-header-row">
            <h2>Resume</h2>
            {currentResume ? (
              <Link className="primary-button small-button" to="/resume">Upload Resume</Link>
            ) : (
              <Link className="primary-button small-button" to="/resume">Upload Resume</Link>
            )}
          </div>

          {currentResume ? (
            <div className="resume-panel-body">
              <div>
                <p className="resume-name">{currentResume.originalFileName}</p>
                <p className="resume-meta">Uploaded: {new Date(currentResume.uploadDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p className="resume-meta">Status: {currentResume.status === 'uploaded' ? 'Ready for Analysis' : currentResume.status}</p>
              </div>

              <div className="resume-item-actions">
                <a className="primary-button small-button" href={`${api.defaults.baseURL.replace(/\/api$/, '')}/api/resumes/${currentResume.id}/view`} target="_blank" rel="noreferrer">
                  View Resume
                </a>
                <Link className="secondary-button small-button" to="/resume">Manage Resume</Link>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Your resume hasn't been uploaded yet.</p>
              <p>Upload your resume to unlock AI-powered resume analysis and job recommendations.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default DashboardPage
