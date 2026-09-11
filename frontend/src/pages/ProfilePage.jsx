import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const emptyProfile = {
  fullName: '',
  email: '',
  phone: '',
  studentId: '',
  department: '',
  branch: '',
  graduationYear: '',
  education: '',
  semester: '',
  cgpa: '',
  careerInterests: '',
  preferredJobRoles: '',
  preferredLocations: '',
  skills: [],
}

function ProfilePage() {
  const { user, logout, token } = useAuth()
  const [profile, setProfile] = useState(emptyProfile)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await api.get('/students/me')
        setProfile({
          ...emptyProfile,
          ...response.data.student,
          skills: Array.isArray(response.data.student.skills) ? response.data.student.skills : [],
        })
      } catch (error) {
        setErrorMessage(error.response?.data?.message || 'Unable to load profile.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [token])

  const profileCompletion = useMemo(() => {
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

  const handleFieldChange = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: field === 'skills' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage('')

    try {
      const payload = {
        ...profile,
        skills: Array.isArray(profile.skills) ? profile.skills : [],
      }

      const response = await api.put('/students/me', payload)
      setProfile({
        ...emptyProfile,
        ...response.data.student,
        skills: Array.isArray(response.data.student.skills) ? response.data.student.skills : [],
      })
      setIsEditing(false)
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Unable to update profile.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  if (isLoading) {
    return <div className="page-loading">Loading profile...</div>
  }

  return (
    <div className="dashboard-shell profile-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">CareerLens AI</div>
        </div>

        <nav className="sidebar-nav">
          <Link className="nav-item" to="/dashboard">Dashboard</Link>
          <Link className="nav-item active" to="/profile">Profile</Link>
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
        <header className="dashboard-header profile-header">
          <div>
            <p className="eyebrow">Student Profile</p>
            <h1>{profile.fullName || 'Student Profile'}</h1>
          </div>
          <div className="profile-actions">
            {!isEditing ? (
              <button type="button" className="primary-button" onClick={() => setIsEditing(true)}>Edit Profile</button>
            ) : (
              <>
                <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="secondary-button" onClick={() => setIsEditing(false)}>Cancel</button>
              </>
            )}
          </div>
        </header>

        {errorMessage && <div className="error-banner">{errorMessage}</div>}

        <section className="profile-panel profile-summary-panel">
          <h2>Profile Completion</h2>
          <div className="profile-completion-row">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${profileCompletion}%` }} />
            </div>
            <strong>{profileCompletion}%</strong>
          </div>
        </section>

        <div className="profile-grid">
          <section className="profile-panel">
            <h2>Personal Information</h2>
            <div className="info-grid">
              <div>
                <label>Full name</label>
                <p>{isEditing ? <input value={profile.fullName} onChange={(event) => handleFieldChange('fullName', event.target.value)} /> : profile.fullName}</p>
              </div>
              <div>
                <label>Email</label>
                <p>{profile.email}</p>
              </div>
              <div>
                <label>Phone</label>
                <p>{isEditing ? <input value={profile.phone || ''} onChange={(event) => handleFieldChange('phone', event.target.value)} /> : profile.phone}</p>
              </div>
              <div>
                <label>Student ID</label>
                <p>{profile.studentId}</p>
              </div>
            </div>
          </section>

          <section className="profile-panel">
            <h2>Academic Information</h2>
            <div className="info-grid">
              <div>
                <label>Department</label>
                <p>{isEditing ? <input value={profile.department || ''} onChange={(event) => handleFieldChange('department', event.target.value)} /> : profile.department}</p>
              </div>
              <div>
                <label>Branch</label>
                <p>{isEditing ? <input value={profile.branch || ''} onChange={(event) => handleFieldChange('branch', event.target.value)} /> : profile.branch}</p>
              </div>
              <div>
                <label>Education</label>
                <p>{isEditing ? <input value={profile.education || ''} onChange={(event) => handleFieldChange('education', event.target.value)} /> : profile.education}</p>
              </div>
              <div>
                <label>Graduation year</label>
                <p>{isEditing ? <input value={profile.graduationYear || ''} onChange={(event) => handleFieldChange('graduationYear', event.target.value)} /> : profile.graduationYear}</p>
              </div>
              <div>
                <label>Semester</label>
                <p>{isEditing ? <input value={profile.semester || ''} onChange={(event) => handleFieldChange('semester', event.target.value)} /> : profile.semester}</p>
              </div>
              <div>
                <label>CGPA</label>
                <p>{isEditing ? <input value={profile.cgpa || ''} onChange={(event) => handleFieldChange('cgpa', event.target.value)} /> : profile.cgpa}</p>
              </div>
            </div>
          </section>

          <section className="profile-panel">
            <h2>Career Preferences</h2>
            <div className="info-grid">
              <div className="full-width-field">
                <label>Career interests</label>
                <p>{isEditing ? <textarea value={profile.careerInterests || ''} onChange={(event) => handleFieldChange('careerInterests', event.target.value)} /> : profile.careerInterests}</p>
              </div>
              <div className="full-width-field">
                <label>Preferred job roles</label>
                <p>{isEditing ? <textarea value={profile.preferredJobRoles || ''} onChange={(event) => handleFieldChange('preferredJobRoles', event.target.value)} /> : profile.preferredJobRoles}</p>
              </div>
              <div className="full-width-field">
                <label>Preferred locations</label>
                <p>{isEditing ? <textarea value={profile.preferredLocations || ''} onChange={(event) => handleFieldChange('preferredLocations', event.target.value)} /> : profile.preferredLocations}</p>
              </div>
            </div>
          </section>

          <section className="profile-panel">
            <h2>Skills</h2>
            <p>{isEditing ? <textarea value={Array.isArray(profile.skills) ? profile.skills.join(', ') : ''} onChange={(event) => handleFieldChange('skills', event.target.value)} /> : (Array.isArray(profile.skills) && profile.skills.length ? profile.skills.join(', ') : 'No skills added yet.')}</p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default ProfilePage
