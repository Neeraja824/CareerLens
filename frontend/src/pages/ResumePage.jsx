import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

function ResumePage() {
  const { user, logout, token } = useAuth()
  const navigate = useNavigate()
  const [resumes, setResumes] = useState([])
  const [currentResume, setCurrentResume] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [resumeToReplaceId, setResumeToReplaceId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const fetchResumes = async () => {
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await api.get('/resumes/me')
        const nextResumes = Array.isArray(response.data.resumes) ? response.data.resumes : []

        setResumes(nextResumes)
        setCurrentResume(nextResumes.find((resume) => resume.isCurrent) || nextResumes[0] || null)
      } catch (error) {
        setErrorMessage(error.response?.data?.message || 'Unable to load resumes.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchResumes()
  }, [token])

  const validateFile = (file) => {
    if (!file) {
      return 'Please upload a PDF or DOCX file.'
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (!allowedTypes.includes(file.type)) {
      return 'Please upload a PDF or DOCX file.'
    }

    if (file.size > 5 * 1024 * 1024) {
      return 'Resume size must be less than 5 MB.'
    }

    return ''
  }

  const clearFileInput = () => {
    const input = document.getElementById('resume-upload-input')
    if (input) {
      input.value = ''
    }
  }

  const refreshResumes = async () => {
    const response = await api.get('/resumes/me')
    const nextResumes = Array.isArray(response.data.resumes) ? response.data.resumes : []
    setResumes(nextResumes)
    setCurrentResume(nextResumes.find((resume) => resume.isCurrent) || nextResumes[0] || null)
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null
    const validationMessage = validateFile(file)

    if (validationMessage) {
      setSelectedFile(null)
      setErrorMessage(validationMessage)
      setSuccessMessage('')
      return
    }

    setSelectedFile(file)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      setErrorMessage('Please upload a PDF or DOCX file.')
      setSuccessMessage('')
      return
    }

    const formData = new FormData()
    formData.append('resume', selectedFile)

    setIsSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      if (resumeToReplaceId) {
        await api.put(`/resumes/${resumeToReplaceId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        await api.post('/resumes/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      await refreshResumes()
      setSuccessMessage(
        resumeToReplaceId
          ? 'Resume updated successfully.'
          : 'Resume uploaded successfully. AI analysis will be available after analysis is completed.',
      )
      setSelectedFile(null)
      setResumeToReplaceId(null)
      clearFileInput()
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Resume upload failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (resumeId) => {
    setIsDeleting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      await api.delete(`/resumes/${resumeId}`)
      await refreshResumes()
      setSuccessMessage('Resume deleted successfully.')
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Unable to delete resume.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleView = (resume) => {
    const baseUrl = api.defaults.baseURL.replace(/\/api$/, '')
    window.open(`${baseUrl}/api/resumes/${resume.id}/view`, '_blank', 'noopener,noreferrer')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleReplaceRequest = (resumeId) => {
    setResumeToReplaceId(resumeId)
    setErrorMessage('')
    setSuccessMessage('Select a replacement file and click Upload Resume.')
    document.getElementById('resume-upload-input')?.click()
  }

  if (isLoading) {
    return <div className="page-loading">Loading resume info...</div>
  }

  return (
    <div className="dashboard-shell profile-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">CareerLens AI</div>
        </div>

        <nav className="sidebar-nav">
          <Link className="nav-item" to="/dashboard">Dashboard</Link>
          <Link className="nav-item" to="/profile">Profile</Link>
          <Link className="nav-item active" to="/resume">My Resume</Link>
          <Link className="nav-item" to="/jobs">Jobs</Link>
          <Link className="nav-item" to="/applications">Applications</Link>
        </nav>

        <div className="user-menu">
          <div className="user-name">{user?.fullName || 'Student'}</div>
          <button type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header profile-header">
          <div>
            <p className="eyebrow">My Resume</p>
            <h1>Resume Management</h1>
          </div>
        </header>

        {errorMessage && <div className="error-banner">{errorMessage}</div>}
        {successMessage && <div className="success-banner">{successMessage}</div>}

        <section className="profile-panel resume-upload-panel">
          <h2>Upload Your Resume</h2>

          <div className="upload-dropzone">
            <input
              id="resume-upload-input"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
            />
            <div className="upload-content">
              <p className="upload-title">Drag and drop or choose a file</p>
              <p className="upload-subtitle">Supported formats: PDF, DOCX • Maximum size: 5 MB</p>
              {selectedFile ? (
                <div className="selected-file-box">
                  <p><strong>Selected file:</strong> {selectedFile.name}</p>
                  <p><strong>File size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="resume-actions-row">
            <button type="button" className="primary-button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Uploading...' : 'Upload Resume'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelectedFile(null)
                setResumeToReplaceId(null)
                setSuccessMessage('')
                clearFileInput()
              }}
            >
              Cancel
            </button>
          </div>
        </section>

        <section className="profile-panel resume-list-panel">
          <div className="resume-header-row">
            <h2>My Resumes</h2>
            {currentResume && <div className="resume-badge">Status: {currentResume.status === 'uploaded' ? 'Ready for Analysis' : currentResume.status}</div>}
          </div>

          {resumes.length === 0 ? (
            <div className="empty-state">
              <p>No resume uploaded yet.</p>
            </div>
          ) : (
            <div className="resume-list">
              {resumes.map((resume) => (
                <article className="resume-item" key={resume.id}>
                  <div>
                    <p className="resume-name">{resume.originalFileName}</p>
                    <p className="resume-meta">
                      {resume.fileType.toUpperCase()} • {(resume.fileSize / 1024).toFixed(1)} KB
                    </p>
                    <p className="resume-meta">
                      Uploaded: {new Date(resume.uploadDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="resume-item-actions">
                    <button type="button" className="primary-button small-button" onClick={() => handleView(resume)}>
                      View
                    </button>
                    <button type="button" className="secondary-button small-button" onClick={() => handleReplaceRequest(resume.id)}>
                      Replace
                    </button>
                    <button
                      type="button"
                      className="secondary-button small-button danger-button"
                      onClick={() => handleDelete(resume.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default ResumePage
