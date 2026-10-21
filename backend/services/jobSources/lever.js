import {
  descriptionText,
  fetchJson,
  requireHttpsUrl,
  requireString,
  sourceDate,
  sourceSalary,
} from './common.js'

export async function fetchLeverJobs(source, fetchImpl = fetch) {
  const siteName = requireString(source.siteName, 'Lever siteName')
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(siteName)}?mode=json`
  const payload = await fetchJson(url, fetchImpl)
  if (!Array.isArray(payload)) {
    throw new Error('Lever response did not contain a complete postings array.')
  }

  return payload.map((job) => {
    if (!job || typeof job.id !== 'string' || !job.id.trim()) {
      throw new Error('Lever response contains a job without a valid external ID.')
    }
    const applicationUrl = requireHttpsUrl(job.hostedUrl, 'Lever application URL')
    const parsedApplicationUrl = new URL(applicationUrl)
    const sitePath = parsedApplicationUrl.pathname.split('/').filter(Boolean)[0]
    if (
      parsedApplicationUrl.hostname !== 'jobs.lever.co'
      || sitePath?.toLocaleLowerCase('en-US') !== siteName.toLocaleLowerCase('en-US')
    ) {
      throw new Error('Lever application URL does not match the configured official site.')
    }
    const postedDate = sourceDate(job.createdAt)
    const salary = sourceSalary(job.salaryRange)
    const location = job.categories?.location
    const commitment = job.categories?.commitment
    const level = job.categories?.level

    return {
      sourceListingId: job.id.trim(),
      title: requireString(job.text, 'Lever job title'),
      description: requireString(descriptionText(job.descriptionPlain || job.description), 'Lever job description'),
      externalApplicationUrl: applicationUrl,
      sourceUrl: applicationUrl,
      ...(typeof location === 'string' && location.trim() ? { location: location.trim() } : {}),
      ...(typeof commitment === 'string' && commitment.trim() ? { employmentType: commitment.trim() } : {}),
      ...(typeof level === 'string' && level.trim() ? { experienceLevel: level.trim() } : {}),
      ...(postedDate ? { postingDate: postedDate } : {}),
      ...(salary ? { salary } : {}),
      requiredSkills: [],
    }
  })
}
