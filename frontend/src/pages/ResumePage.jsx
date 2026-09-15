import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const formatFileSize = (bytes = 0) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

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

  const analysisResult = useMemo(() => {
    if (!currentResume) {
      return null
    }

    const hasAnalysis = currentResume.resumeScore !== null
      || (currentResume.skills && currentResume.skills.length > 0)
      || (currentResume.summary && currentResume.summary.length > 0)

    if (!hasAnalysis) {
      return null
    }

    return {
      resumeScore: currentResume.resumeScore ?? 0,
      skills: currentResume.skills || [],
      missingSkills: currentResume.missingSkills || [],
      strengths: currentResume.strengths || [],
      improvements: currentResume.improvements || [],
      education: currentResume.education || [],
      projects: currentResume.projects || [],
      certifications: currentResume.certifications || [],
      experience: currentResume.experience || [],
      summary: currentResume.summary || '',
    }
  }, [currentResume])

  const validateFile = (file) => {
    if (!file) {
      return 'Please upload a PDF or DOCX file.'
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
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
    setSuccessMessage('Analyzing your resume...')

    try {
      let response

      if (resumeToReplaceId) {
        response = await api.put(`/resumes/${resumeToReplaceId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        response = await api.post('/resumes/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      await refreshResumes()
      setSuccessMessage(response?.data?.message || 'Resume analyzed successfully.')
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
    setSuccessMessage('Select a replacement file and click Analyze Resume.')
    document.getElementById('resume-upload-input')?.click()
  }

  const renderChecklist = (items = []) => {
    if (!items.length) {
      return <p className="empty-list-text">No items found.</p>
    }

    return (
      <ul className="analysis-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
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
          <Link className="nav-item active" to="/resume">Resume Analyzer</Link>
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
            <p className="eyebrow">Resume Analyzer</p>
            <h1>Resume Analysis</h1>
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
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
            />
            <div className="upload-content">
              <p className="upload-title">Drag and drop or choose a file</p>
              <p className="upload-subtitle">Supported formats: PDF, DOC, DOCX • Maximum size: 5 MB</p>
              {selectedFile ? (
                <div className="selected-file-box">
                  <p><strong>Selected file:</strong> {selectedFile.name}</p>
                  <p><strong>File size:</strong> {formatFileSize(selectedFile.size)}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="resume-actions-row">
            <button type="button" className="primary-button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Analyzing...' : 'Analyze Resume'}
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

        {currentResume && currentResume.status === 'pending-analysis' && (
          <section className="profile-panel analysis-panel">
            <h2>Analysis Status</h2>
            <p className="analysis-status-text">
              Your resume has been uploaded and is waiting for AI analysis. Please try again in a moment.
            </p>
          </section>
        )}

        {analysisResult && (
          <section className="profile-panel analysis-panel">
            <div className="resume-header-row">
              <h2>Resume Analysis</h2>
              <button type="button" className="secondary-button small-button" onClick={() => setSelectedFile(null)}>
                Analyze Another Resume
              </button>
            </div>

            <div className="analysis-overview">
              <div className="score-card">
                <span>Resume Score</span>
                <strong>{analysisResult.resumeScore}/100</strong>
              </div>
            </div>

            <div className="analysis-grid">
              <div className="analysis-card">
                <h3>Skills Found</h3>
                {renderChecklist(analysisResult.skills)}
              </div>

              <div className="analysis-card">
                <h3>Missing / Recommended Skills</h3>
                {renderChecklist(analysisResult.missingSkills)}
              </div>

              <div className="analysis-card">
                <h3>Resume Strengths</h3>
                {renderChecklist(analysisResult.strengths)}
              </div>

              <div className="analysis-card">
                <h3>Areas to Improve</h3>
                {renderChecklist(analysisResult.improvements)}
              </div>

              <div className="analysis-card full-width">
                <h3>Profile Summary</h3>
                <p className="analysis-summary">{analysisResult.summary}</p>
              </div>

              <div className="analysis-card">
                <h3>Education</h3>
                {renderChecklist(analysisResult.education)}
              </div>

              <div className="analysis-card">
                <h3>Projects</h3>
                {renderChecklist(analysisResult.projects)}
              </div>

              <div className="analysis-card">
                <h3>Certifications</h3>
                {renderChecklist(analysisResult.certifications)}
              </div>

              <div className="analysis-card">
                <h3>Experience / Internships</h3>
                {renderChecklist(analysisResult.experience)}
              </div>
            </div>
          </section>
        )}

        <section className="profile-panel resume-list-panel">
          <div className="resume-header-row">
            <h2>My Resumes</h2>
            {currentResume && (
              <div className="resume-badge">
                Status: {currentResume.status === 'analysis-ready' ? 'Ready for Analysis' : currentResume.status}
              </div>
            )}
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
                      {resume.fileType.toUpperCase()} • {formatFileSize(resume.fileSize)}
                    </p>
                    <p className="resume-meta">
                      Uploaded: {new Date(resume.uploadDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    {resume.resumeScore !== null && resume.resumeScore !== undefined && (
                      <p className="resume-meta">Resume score: {resume.resumeScore}/100</p>
                    )}
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
