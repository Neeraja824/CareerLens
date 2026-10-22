function formatReviewDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function verificationDetails(job) {
  if (
    ['approved', 'rejected'].includes(job.sourceReviewStatus)
    && job.sourceReviewAt
    && job.sourceReviewBy
  ) {
    const reviewedAt = formatReviewDate(job.sourceReviewAt)
    if (reviewedAt) {
      const availability = job.sourceReviewAvailability === 'available'
        ? 'marked available'
        : 'not confirmed available'
      return {
        label: `Careers and application pages reviewed: ${job.sourceReviewStatus} · ${reviewedAt} by ${job.sourceReviewBy} · ${availability}`,
        type: 'reviewed',
      }
    }
  }

  if (
    ['greenhouse', 'lever'].includes(job.sourceProvider)
    && job.sourceCompany
    && job.lastCheckedAt
  ) {
    const lastCheckedAt = formatReviewDate(job.lastCheckedAt)
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
