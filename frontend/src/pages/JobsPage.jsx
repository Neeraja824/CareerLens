import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import JobCard from '../components/jobs/JobCard.jsx'

const officialCompanyCareers = [
  {
    company: 'Amazon',
    description: 'Explore roles and apply directly on Amazon’s official careers website.',
    url: 'https://www.amazon.jobs/',
  },
  {
    company: 'Google',
    description: 'Explore roles and apply directly on Google’s official careers website.',
    url: 'https://www.google.com/about/careers/applications/',
  },
  {
    company: 'Infosys',
    description: 'Explore roles and apply directly on Infosys’s official careers website.',
    url: 'https://www.infosys.com/careers/',
  },
  {
    company: 'Microsoft',
    description: 'Search and apply for opportunities directly on Microsoft’s official careers website.',
    url: 'https://jobs.careers.microsoft.com/global/en/search',
  },
  {
    company: 'TCS',
    description: 'Explore roles and apply directly on TCS’s official careers website.',
    url: 'https://www.tcs.com/careers',
  },
]

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

function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [resumeStatus, setResumeStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeView, setActiveView] = useState('recommended')
  const [filters, setFilters] = useState({
    keyword: '',
    location: '',
    skills: '',
    experienceLevel: '',
    employmentType: '',
  })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const requestSequence = useRef(0)

  const fetchRecommendations = useCallback(() => {
    const requestId = ++requestSequence.current
    return api.get('/jobs/recommended')
    .then((response) => {
      if (requestId !== requestSequence.current) return
      const recommendations = Array.isArray(response.data.recommendations)
        ? response.data.recommendations
        : []
      setJobs(recommendations)
      setResumeStatus(response.data.resumeStatus || 'missing')
    })
    .catch((error) => {
      if (requestId !== requestSequence.current) return
      setJobs([])
      setErrorMessage(getRequestErrorMessage(error, 'Unable to load recommendations.'))
    })
    .finally(() => {
      if (requestId === requestSequence.current) setIsLoading(false)
    })
  }, [])

  const fetchBrowseResults = useCallback((searchFilters, nextPage = 1) => {
    const requestId = ++requestSequence.current
    const params = Object.fromEntries(
      Object.entries(searchFilters).filter(([, value]) => value.trim()),
    )
    params.page = nextPage
    params.limit = 20
    setIsLoading(true)
    setErrorMessage('')
    api.get('/jobs', { params })
      .then((response) => {
        if (requestId !== requestSequence.current) return
        setJobs(Array.isArray(response.data.jobs) ? response.data.jobs : [])
        setPage(response.data.pagination?.page || nextPage)
        setTotalPages(Math.max(1, response.data.pagination?.totalPages || 1))
      })
      .catch((error) => {
        if (requestId !== requestSequence.current) return
        setJobs([])
        setTotalPages(1)
        setErrorMessage(getRequestErrorMessage(error, 'Unable to load job listings.'))
      })
      .finally(() => {
        if (requestId === requestSequence.current) setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchRecommendations()
  }, [fetchRecommendations])

  const handleRetry = () => {
    if (activeView === 'browse') {
      fetchBrowseResults(filters, page)
    } else {
      setIsLoading(true)
      setErrorMessage('')
      fetchRecommendations()
    }
  }

  const handleRecommendationView = () => {
    setActiveView('recommended')
    setIsLoading(true)
    setErrorMessage('')
    fetchRecommendations()
  }

  const handleBrowseView = () => {
    setActiveView('browse')
    fetchBrowseResults(filters)
  }

  const handleSearch = (event) => {
    event.preventDefault()
    fetchBrowseResults(filters)
  }

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const internships = jobs.filter((job) => (
    job.resumeSkillMatch?.status === 'available'
    && job.resumeSkillMatch.matchPercentage > 0
    && (/intern/i.test(`${job.title} ${job.employmentType}`))
  ))
  const fresherJobs = jobs.filter((job) => (
    job.resumeSkillMatch?.status === 'available'
    && job.resumeSkillMatch.matchPercentage > 0
    && !/intern/i.test(`${job.title} ${job.employmentType}`)
    && /fresher|entry[ -]?level|graduate|0\s*[-–]\s*1\s*years?/i.test(
      `${job.title} ${job.experienceLevel} ${job.employmentType}`,
    )
  ))
  const canRecommend = resumeStatus === 'analysis-ready'

  return (
    <JobsLayout>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Career opportunities</p>
          <h1>{activeView === 'browse' ? 'Explore verified jobs' : 'Opportunities matched to you'}</h1>
          <p className="jobs-intro">Explore current listings from employer career feeds or see opportunities ranked against your analyzed resume.</p>
        </div>
      </header>

      <nav className="jobs-view-tabs" aria-label="Job views">
        <button
          type="button"
          className={`jobs-view-tab${activeView === 'recommended' ? ' active' : ''}`}
          aria-pressed={activeView === 'recommended'}
          onClick={handleRecommendationView}
        >
          Recommended for you
        </button>
        <button
          type="button"
          className={`jobs-view-tab${activeView === 'browse' ? ' active' : ''}`}
          aria-pressed={activeView === 'browse'}
          onClick={handleBrowseView}
        >
          Browse all jobs
        </button>
      </nav>

      {activeView === 'browse' && (
        <form className="job-search-panel" onSubmit={handleSearch}>
          <div className="job-search-fields">
            <label>
              Search jobs
              <input name="keyword" value={filters.keyword} onChange={handleFilterChange} placeholder="Title, company, or keyword" />
            </label>
            <label>
              Location
              <input name="location" value={filters.location} onChange={handleFilterChange} placeholder="City or remote" />
            </label>
            <label>
              Required skills
              <input name="skills" value={filters.skills} onChange={handleFilterChange} placeholder="Comma-separated skills" />
            </label>
            <label>
              Experience
              <input name="experienceLevel" value={filters.experienceLevel} onChange={handleFilterChange} placeholder="e.g. Entry level" />
            </label>
            <label>
              Job type
              <input name="employmentType" value={filters.employmentType} onChange={handleFilterChange} placeholder="e.g. Full-time" />
            </label>
          </div>
          <div className="job-search-actions">
            <button className="primary-button small-button" type="submit">Search jobs</button>
            <button
              className="secondary-button small-button"
              type="button"
              onClick={() => {
                const clearedFilters = {
                  keyword: '',
                  location: '',
                  skills: '',
                  experienceLevel: '',
                  employmentType: '',
                }
                setFilters(clearedFilters)
                fetchBrowseResults(clearedFilters)
              }}
            >
              Clear filters
            </button>
          </div>
        </form>
      )}

      {!isLoading && !errorMessage && resumeStatus !== 'analysis-ready' && (
        <div className="resume-recommendation-notice" role="status">
          <p>{resumeStatus === 'missing'
            ? 'Upload and analyze a resume to get personalized recommendations. You can still explore verified opportunities below.'
            : 'Your current resume analysis is not ready yet. Recommendations will be personalized once analysis completes.'}</p>
          <Link className="secondary-button small-button" to="/resume">{resumeStatus === 'missing' ? 'Analyze resume' : 'View resume status'}</Link>
        </div>
      )}

      <section className="jobs-results" aria-live="polite" aria-busy={isLoading}>
        <div className="jobs-results-heading">
          <h2>{activeView === 'browse' ? 'Job listings' : 'Recommended for You'}</h2>
          {!isLoading && jobs.length > 0 && (
            <span>{activeView === 'browse' ? `${jobs.length} listings on this page` : `${jobs.length} ${jobs.length === 1 ? 'opportunity' : 'opportunities'}`}</span>
          )}
        </div>
        {isLoading && <div className="empty-state"><p>{activeView === 'browse' ? 'Searching job listings...' : 'Loading job listings...'}</p></div>}
        {!isLoading && errorMessage && (
          <div className="error-banner" role="alert">
            <p>{errorMessage}</p>
            <button className="secondary-button small-button" type="button" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}
        {!isLoading && !errorMessage && jobs.length === 0 && (
          activeView === 'browse'
            ? <div className="empty-state jobs-empty-state"><h3>No active verified jobs match your search</h3><p>Try broadening or clearing your filters, or explore the official employer career pages below.</p></div>
            : <div className="empty-state jobs-empty-state">
              <h3>No active verified jobs are available</h3>
              <p>
                There are no active listings verified by an employer or college placement office right now.
                Please check back as new opportunities are verified, or explore the official employer career pages below.
              </p>
            </div>
        )}
        {!isLoading && !errorMessage && jobs.length > 0 && (
          <>
            <div className="job-list">
              {jobs.map((job) => <JobCard key={job._id} job={job} showMatch />)}
            </div>
          </>
        )}
        {!isLoading && !errorMessage && activeView === 'browse' && totalPages > 1 && (
          <nav className="job-pagination" aria-label="Job listing pages">
            <button
              className="secondary-button small-button"
              type="button"
              disabled={page <= 1}
              onClick={() => fetchBrowseResults(filters, page - 1)}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="secondary-button small-button"
              type="button"
              disabled={page >= totalPages}
              onClick={() => fetchBrowseResults(filters, page + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      {activeView === 'recommended' && canRecommend && !isLoading && !errorMessage && (
        <>
          {internships.length > 0 && (
            <section className="jobs-results recommendation-category">
              <div className="jobs-results-heading"><h2>Relevant Internships</h2><span>{internships.length} matches</span></div>
              <div className="job-list">{internships.map((job) => <JobCard key={`internship-${job._id}`} job={job} showMatch />)}</div>
            </section>
          )}
          {fresherJobs.length > 0 && (
            <section className="jobs-results recommendation-category">
              <div className="jobs-results-heading"><h2>Fresher Jobs</h2><span>{fresherJobs.length} matches</span></div>
              <div className="job-list">{fresherJobs.map((job) => <JobCard key={`fresher-${job._id}`} job={job} showMatch />)}</div>
            </section>
          )}
        </>
      )}
      <section className="official-careers-section" aria-labelledby="official-careers-heading">
        <div className="official-careers-heading">
          <div>
            <p className="eyebrow">Explore directly with employers</p>
            <h2 id="official-careers-heading">Official Company Careers</h2>
          </div>
          <p className="official-careers-notice">
            External website. The link opens in a new tab, and you will leave CareerLens.
          </p>
        </div>
        {officialCompanyCareers.map(({ company, description, url }) => (
          <article className="official-career-card" key={company}>
            <div className="official-career-copy">
              <h3>{company}</h3>
              <p>{description}</p>
            </div>
            <a
              className="primary-button small-button official-career-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Official Careers
              <span className="visually-hidden"> for {company} (opens in a new tab; leaves CareerLens)</span>
            </a>
          </article>
        ))}
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
