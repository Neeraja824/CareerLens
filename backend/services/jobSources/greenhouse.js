import {
  descriptionText,
  fetchJson,
  requireHttpsUrl,
  requireString,
  sourceDate,
  sourceSalary,
} from './common.js'

export async function fetchGreenhouseJobs(source, fetchImpl = fetch) {
  const boardToken = requireString(source.boardToken, 'Greenhouse boardToken')
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`
  const payload = await fetchJson(url, fetchImpl)
  if (!payload || !Array.isArray(payload.jobs)) {
    throw new Error('Greenhouse response did not contain a complete jobs array.')
  }

  return payload.jobs.map((job) => {
    if (
      !job
      || (typeof job.id !== 'string' && typeof job.id !== 'number')
      || !String(job.id).trim()
    ) {
      throw new Error('Greenhouse response contains a job without a valid external ID.')
    }
    const applicationUrl = requireHttpsUrl(job.absolute_url, 'Greenhouse application URL')
    const parsedApplicationUrl = new URL(applicationUrl)
    const boardPath = parsedApplicationUrl.pathname.split('/').filter(Boolean)[0]
    if (
      !['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(parsedApplicationUrl.hostname)
      || boardPath?.toLocaleLowerCase('en-US') !== boardToken.toLocaleLowerCase('en-US')
    ) {
      throw new Error('Greenhouse application URL does not match the configured official board.')
    }
    const postedDate = sourceDate(job.created_at)
    const firstPublishedAt = sourceDate(job.first_published)
    const sourceUpdatedAt = sourceDate(job.updated_at)
    const salary = sourceSalary(job.salary_range)
    const location = typeof job.location?.name === 'string' && job.location.name.trim()
      ? job.location.name.trim()
      : undefined
    return {
      sourceListingId: String(job.id).trim(),
      title: requireString(job.title, 'Greenhouse job title'),
      description: requireString(descriptionText(job.content), 'Greenhouse job description'),
      externalApplicationUrl: applicationUrl,
      sourceUrl: applicationUrl,
      ...(location ? { location } : {}),
      ...(postedDate ? { postingDate: postedDate } : {}),
      ...(firstPublishedAt ? { sourceFirstPublishedAt: firstPublishedAt } : {}),
      ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
      ...(salary ? { salary } : {}),
      requiredSkills: [],
    }
  })
}
