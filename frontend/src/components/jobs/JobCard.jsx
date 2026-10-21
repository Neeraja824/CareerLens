import { Link } from 'react-router-dom'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatSalary(salary) {
  if (
    !salary
    || !Number.isFinite(salary.min)
    || !Number.isFinite(salary.max)
    || typeof salary.currency !== 'string'
    || !/^[A-Z]{3}$/.test(salary.currency)
    || !['hour', 'day', 'week', 'month', 'year'].includes(salary.interval)
  ) {
    return ''
  }
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: salary.currency,
    maximumFractionDigits: 0,
  })
  return `${formatter.format(salary.min)}–${formatter.format(salary.max)} / ${salary.interval}`
}

function verificationDetails(job) {
  if (
    ['greenhouse', 'lever'].includes(job.sourceProvider)
    && job.sourceCompany
    && job.lastCheckedAt
  ) {
    const lastCheckedAt = formatDate(job.lastCheckedAt)
    if (lastCheckedAt) {
      const provider = job.sourceProvider[0].toUpperCase() + job.sourceProvider.slice(1)
      return {
        label: `Official ${provider} feed · checked ${lastCheckedAt}`,
        type: 'official',
      }
    }
  }
  if (job.verifiedBy) {
    const authority = job.verifiedBy === 'employer'
      ? 'employer'
      : job.verifiedBy === 'college_placement_office'
        ? 'college placement office'
        : 'source'
    return {
      label: `Verification metadata: ${authority} (not independently authenticated)`,
      type: 'metadata',
    }
  }
  return { label: 'Source verification unavailable', type: 'unavailable' }
}

function JobCard({ job, showMatch = false }) {
  const postedDate = formatDate(job.postingDate)
  const salary = formatSalary(job.salary)
  const match = job.resumeSkillMatch
  const verification = verificationDetails(job)

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
        {job.location && <span>{job.location}</span>}
        {job.experienceLevel && <span>{job.experienceLevel}</span>}
        {job.employmentType && <span>{job.employmentType}</span>}
        {salary && <span className="job-salary">{salary}</span>}
      </div>
      <div className={`job-verification job-verification-${verification.type}`}>{verification.label}</div>
      <p className="job-description">{job.description}</p>
      {showMatch && (
        <div className="job-match-details">
          <p className="job-match-score">
            {match?.status === 'available'
              ? <><strong>{match.matchPercentage}%</strong> resume skill match</>
              : match?.message || 'Resume skill match is not available.'}
          </p>
          {match?.status === 'available' && (
            <div className="job-match-skill-groups">
              <div>
                <h3>Matched skills</h3>
                {match.matchedSkills.length > 0
                  ? <ul className="job-skill-list">{match.matchedSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
                  : <p className="empty-list-text">No required skills matched.</p>}
              </div>
              <div>
                <h3>Missing skills</h3>
                {match.missingSkills.length > 0
                  ? <ul className="job-skill-list">{match.missingSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
                  : <p className="empty-list-text">No required skills are missing.</p>}
              </div>
            </div>
          )}
        </div>
      )}
      {!showMatch && Array.isArray(job.requiredSkills) && job.requiredSkills.length > 0 && (
        <ul className="job-skill-list" aria-label="Required skills">
          {job.requiredSkills.map((skill, index) => <li key={`${skill}-${index}`}>{skill}</li>)}
        </ul>
      )}
      <div className="job-card-footer">
        <span className="job-source">
          {job.sourceName}
          {job.sourceUrl && (
            <> · <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>
          )}
        </span>
        <div className="job-card-actions">
          {job.externalApplicationUrl && (
            <a className="primary-button small-button" href={job.externalApplicationUrl} target="_blank" rel="noopener noreferrer">
              Apply
            </a>
          )}
          <Link className="secondary-button small-button" to={`/jobs/${job._id}`}>View details</Link>
        </div>
      </div>
    </article>
  )
}

export default JobCard
