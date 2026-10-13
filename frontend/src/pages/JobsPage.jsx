import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const pageSize = 12

const initialFilters = {
  keyword: '',
  location: '',
  skills: '',
  experienceLevel: '',
  employmentType: '',
}

function getRequestErrorMessage(error, fallback) {
  if (error.response?.status === 401) {
    return 'Your session has expired. Please sign in again.'
  }
  if (error.response?.status >= 500) {
    return 'The server could not complete your request. Please try again shortly.'
  }
  if (!error.response) {
    return 'Unable to reach CareerLens right now. Check your connection and try again.'
  }

  return error.response.data?.message || fallback
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function JobsLayout({ children, activeItem = 'jobs' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">CareerLens AI</div>
        </div>
        <nav className="sidebar-nav" aria-label="Student navigation">
          <Link className="nav-item" to="/dashboard">Dashboard</Link>
          <Link className="nav-item" to="/profile">Profile</Link>
          <Link className="nav-item" to="/resume">Resume</Link>
          <Link className={`nav-item${activeItem === 'jobs' ? ' active' : ''}`} to="/jobs">Jobs</Link>
          <Link className="nav-item" to="/applications">Applications</Link>
        </nav>
        <div className="user-menu">
          <div className="user-name">{user?.fullName || 'Student'}</div>
          <Link to="/profile">Profile</Link>
          <button type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main className="dashboard-main jobs-main">{children}</main>
    </div>
  )
}

function JobCard({ job }) {
  const postedDate = formatDate(job.postingDate)

  return (
    <article className="job-card">
      <div className="job-card-heading">
        <div>
          <p className="job-company">{job.companyName}</p>
          <h2>{job.title}</h2>
        </div>
        {postedDate && <span className="job-posted">Posted {postedDate}</span>}
      </div>
      <div className="job-meta">
        <span>{job.location}</span>
        <span>{job.experienceLevel}</span>
        <span>{job.employmentType}</span>
      </div>
      <p className="job-description">{job.description}</p>
      {Array.isArray(job.requiredSkills) && job.requiredSkills.length > 0 && (
        <ul className="job-skill-list" aria-label="Required skills">
          {job.requiredSkills.map((skill, index) => (
            <li key={`${skill}-${index}`}>{skill}</li>
          ))}
        </ul>
      )}
      <div className="job-card-footer">
        <span className="job-source">Source: {job.sourceName}</span>
        <Link className="primary-button small-button" to={`/jobs/${job._id}`}>View details</Link>
      </div>
    </article>
  )
}

function JobsPage() {
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [jobs, setJobs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: pageSize, totalJobs: 0, totalPages: 0 })
  const [availableJobCount, setAvailableJobCount] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const fetchJobs = useCallback((nextFilters, page) => {
    const params = { page, limit: pageSize }
    for (const [name, value] of Object.entries(nextFilters)) {
      if (value.trim()) params[name] = value.trim()
    }

    return api.get('/jobs', { params })
      .then((response) => {
        setJobs(Array.isArray(response.data.jobs) ? response.data.jobs : [])
        setPagination(response.data.pagination || {
          page,
          limit: pageSize,
          totalJobs: 0,
          totalPages: 0,
        })
        if (!Object.values(nextFilters).some((value) => value.trim())) {
          setAvailableJobCount(response.data.pagination?.totalJobs ?? 0)
        }
      })
      .catch((error) => {
        setJobs([])
        setPagination({ page, limit: pageSize, totalJobs: 0, totalPages: 0 })
        setErrorMessage(getRequestErrorMessage(error, 'Unable to load jobs.'))
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    fetchJobs(initialFilters, 1)
  }, [fetchJobs])

  const hasActiveFilters = Object.values(appliedFilters).some((value) => value.trim())
  const hasJobsInDatabase = availableJobCount === null
    ? pagination.totalJobs > 0
    : availableJobCount > 0

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setAppliedFilters(filters)
    setIsLoading(true)
    setErrorMessage('')
    fetchJobs(filters, 1)
  }

  const handleClearFilters = () => {
    setFilters(initialFilters)
    setAppliedFilters(initialFilters)
    setIsLoading(true)
    setErrorMessage('')
    fetchJobs(initialFilters, 1)
  }

  const handlePageChange = (page) => {
    setIsLoading(true)
    setErrorMessage('')
    fetchJobs(appliedFilters, page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRetry = () => {
    setIsLoading(true)
    setErrorMessage('')
    fetchJobs(appliedFilters, pagination.page)
  }

  return (
    <JobsLayout>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Career opportunities</p>
          <h1>Find your next opportunity</h1>
          <p className="jobs-intro">Search active listings by role, location, skills, and more.</p>
        </div>
      </header>

      <form className="job-filter-panel profile-panel" onSubmit={handleSearch}>
        <div className="job-filter-grid">
          <label className="job-filter-keyword">
            Keyword
            <input
              name="keyword"
              value={filters.keyword}
              onChange={handleFilterChange}
              placeholder="Job title, company, or description"
            />
          </label>
          <label>
            Location
            <input name="location" value={filters.location} onChange={handleFilterChange} placeholder="e.g. Remote" />
          </label>
          <label>
            Required skills
            <input name="skills" value={filters.skills} onChange={handleFilterChange} placeholder="e.g. React, SQL" />
            <span className="filter-hint">Separate multiple skills with commas.</span>
          </label>
          <label>
            Experience level
            <input name="experienceLevel" value={filters.experienceLevel} onChange={handleFilterChange} placeholder="e.g. Entry-level" />
          </label>
          <label>
            Employment type
            <input name="employmentType" value={filters.employmentType} onChange={handleFilterChange} placeholder="e.g. Full-time" />
          </label>
        </div>
        <div className="job-filter-actions">
          <button className="primary-button" type="submit" disabled={isLoading}>Search jobs</button>
          <button className="secondary-button" type="button" onClick={handleClearFilters} disabled={isLoading}>
            Clear filters
          </button>
        </div>
      </form>

      <section className="jobs-results" aria-live="polite" aria-busy={isLoading}>
        <div className="jobs-results-heading">
          <h2>Job listings</h2>
          {!isLoading && hasJobsInDatabase && (
            <span>{pagination.totalJobs} {pagination.totalJobs === 1 ? 'job' : 'jobs'} found</span>
          )}
        </div>
        {isLoading && <div className="empty-state"><p>Loading job listings...</p></div>}
        {!isLoading && errorMessage && (
          <div className="error-banner" role="alert">
            <p>{errorMessage}</p>
            <button className="secondary-button small-button" type="button" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}
        {!isLoading && !errorMessage && jobs.length === 0 && (
          <div className="empty-state jobs-empty-state">
            <h3>
              {!hasJobsInDatabase
                ? 'No job listings yet'
                : hasActiveFilters
                  ? 'No jobs match these filters'
                  : 'No job listings yet'}
            </h3>
            <p>
              {!hasJobsInDatabase
                ? 'There are currently no active listings to search. Please check back later.'
                : hasActiveFilters
                ? 'Try adjusting your search criteria and search again.'
                : 'There are currently no active listings. Please check back later.'}
            </p>
          </div>
        )}
        {!isLoading && !errorMessage && jobs.length > 0 && (
          <>
            <div className="job-list">
              {jobs.map((job) => <JobCard key={job._id} job={job} />)}
            </div>
            {pagination.totalPages > 1 && (
              <nav className="job-pagination" aria-label="Job listing pages">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={isLoading || pagination.page <= 1}
                >
                  Previous
                </button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={isLoading || pagination.page >= pagination.totalPages}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </JobsLayout>
  )
}

function SkillList({ title, skills, emptyMessage }) {
  return (
    <section className="analysis-card">
      <h3>{title}</h3>
      {Array.isArray(skills) && skills.length > 0 ? (
        <ul className="job-skill-list">
          {skills.map((skill, index) => <li key={`${skill}-${index}`}>{skill}</li>)}
        </ul>
      ) : (
        <p className="empty-list-text">{emptyMessage}</p>
      )}
    </section>
  )
}

function JobDetailsPage() {
  const { id } = useParams()
  const [detailState, setDetailState] = useState({ requestKey: null, loading: true })
  const [matchState, setMatchState] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${id}:${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()

    api.get(`/jobs/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((response) => setDetailState({
        requestKey,
        job: response.data.job || null,
        loading: false,
        error: '',
      }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDetailState({
            requestKey,
            job: null,
            loading: false,
            error: error.response?.status === 404
              ? 'This job is no longer available. It may have expired or been removed.'
              : getRequestErrorMessage(error, 'Unable to load this job listing.'),
          })
        }
      })

    return () => controller.abort()
  }, [id, reloadKey, requestKey])

  const isLoading = detailState.requestKey !== requestKey || detailState.loading
  const job = detailState.requestKey === requestKey ? detailState.job : null
  const loadError = detailState.requestKey === requestKey ? detailState.error : ''
  const currentMatch = matchState?.jobId === id ? matchState : null
  const isMatching = Boolean(currentMatch?.loading)
  const matchResult = currentMatch?.result || null
  const matchError = currentMatch?.error || ''

  const handleCheckMatch = async () => {
    setMatchState({ jobId: id, loading: true, result: null, error: '' })

    try {
      const response = await api.get(`/jobs/${encodeURIComponent(id)}/match`)
      const result = response.data.resumeSkillMatch || null
      setMatchState({
        jobId: id,
        loading: false,
        result,
        error: result ? '' : 'The server did not return resume match information. Please try again.',
      })
    } catch (error) {
      setMatchState({
        jobId: id,
        loading: false,
        result: null,
        error: error.response?.status === 404
          ? 'This job is no longer available. It may have expired or been removed.'
          : getRequestErrorMessage(error, 'Unable to check your resume match.'),
      })
    }
  }

  const canDisplayPercentage = matchResult?.status === 'available'
    && typeof matchResult.matchPercentage === 'number'
    && Number.isFinite(matchResult.matchPercentage)

  return (
    <JobsLayout>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Job details</p>
          <Link className="jobs-back-link" to="/jobs">← Back to job search</Link>
        </div>
      </header>
      {isLoading && <div className="empty-state"><p>Loading job details...</p></div>}
      {!isLoading && loadError && (
        <section className="empty-state job-error-state" role="alert">
          <h1>Job unavailable</h1>
          <p>{loadError}</p>
          <button
            className="secondary-button small-button"
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Try again
          </button>
          <Link className="primary-button small-button" to="/jobs">Return to job search</Link>
        </section>
      )}
      {!isLoading && !loadError && job && (
        <>
          <article className="profile-panel job-detail-panel">
            <p className="job-company">{job.companyName}</p>
            <h1>{job.title}</h1>
            <div className="job-meta job-detail-meta">
              <span>{job.location}</span>
              <span>{job.experienceLevel}</span>
              <span>{job.employmentType}</span>
            </div>
            <div className="job-detail-dates">
              {formatDate(job.postingDate) && <span>Posted {formatDate(job.postingDate)}</span>}
              {formatDate(job.expiryDate) && <span>Expires {formatDate(job.expiryDate)}</span>}
            </div>
            <section className="job-description-section">
              <h2>About the role</h2>
              <p>{job.description}</p>
            </section>
            <SkillList title="Required skills" skills={job.requiredSkills} emptyMessage="No required skills were listed for this job." />
            <div className="job-detail-source">
              <span>Listed by {job.sourceName}</span>
              {job.sourceUrl && (
                <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>
              )}
            </div>
            <div className="job-detail-actions">
              <button className="primary-button" type="button" onClick={handleCheckMatch} disabled={isMatching}>
                {isMatching ? 'Checking resume match...' : 'Check Resume Match'}
              </button>
              {job.externalApplicationUrl && (
                <a className="secondary-button" href={job.externalApplicationUrl} target="_blank" rel="noopener noreferrer">
                  Apply on employer site
                </a>
              )}
            </div>
          </article>

          {(isMatching || matchError || matchResult) && (
            <section className="profile-panel match-panel" aria-live="polite" aria-busy={isMatching}>
              <h2>Resume skill match</h2>
              {isMatching && <p className="analysis-status-text">Comparing this job with your current analyzed resume...</p>}
              {!isMatching && matchError && <p className="error-banner" role="alert">{matchError}</p>}
              {!isMatching && matchResult?.status === 'unavailable' && (
                <p className="empty-state">{matchResult.message || 'An analysis-ready current resume is not available. Analyze a resume to check your skill match.'}</p>
              )}
              {!isMatching && matchResult?.status === 'not_comparable' && (
                <p className="empty-state">{matchResult.message || 'This job does not list required skills, so a resume skill match cannot be calculated.'}</p>
              )}
              {!isMatching && matchResult?.status === 'available' && (
                <>
                  {canDisplayPercentage
                    ? <p className="match-percentage"><strong>{matchResult.matchPercentage}%</strong> resume skill match</p>
                    : <p className="empty-state">{matchResult.message || 'A match percentage is not available for this result.'}</p>}
                  <div className="analysis-grid">
                    <SkillList title="Matched skills" skills={matchResult.matchedSkills} emptyMessage="No required skills matched." />
                    <SkillList title="Missing skills" skills={matchResult.missingSkills} emptyMessage="No required skills are missing." />
                  </div>
                  <p className="match-disclaimer">This compares listed job requirements with skills from your analyzed resume. It is not a prediction of hiring success.</p>
                </>
              )}
            </section>
          )}
        </>
      )}
    </JobsLayout>
  )
}

export { JobDetailsPage, JobsPage }
