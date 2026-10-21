import { createImportKey } from '../utils/importJobIdentity.js'
import { fetchGreenhouseJobs } from './jobSources/greenhouse.js'
import { fetchLeverJobs } from './jobSources/lever.js'

const sourceFetchers = {
  greenhouse: fetchGreenhouseJobs,
  lever: fetchLeverJobs,
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

export function parseJobSourceConfig(rawConfig) {
  let sources
  try {
    sources = JSON.parse(rawConfig || '[]')
  } catch {
    throw new Error('JOB_SOURCE_CONFIG_JSON must be valid JSON.')
  }
  if (!Array.isArray(sources)) {
    throw new Error('JOB_SOURCE_CONFIG_JSON must be a JSON array.')
  }

  const seenSources = new Set()
  return sources.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error(`Job source ${index + 1} must be an object.`)
    }
    const provider = requiredText(source.provider, `Job source ${index + 1} provider`).toLowerCase()
    if (!sourceFetchers[provider]) {
      throw new Error(`Job source ${index + 1} has unsupported provider "${provider}".`)
    }
    const sourceCompany = requiredText(source.sourceCompany, `Job source ${index + 1} sourceCompany`)
    if (sourceCompany.length > 160) {
      throw new Error(`Job source ${index + 1} sourceCompany must be 160 characters or fewer.`)
    }
    let careersUrl
    try {
      careersUrl = new URL(requiredText(source.careersUrl, `Job source ${index + 1} careersUrl`))
    } catch {
      throw new Error(`Job source ${index + 1} careersUrl must be a valid HTTPS URL.`)
    }
    if (
      careersUrl.protocol !== 'https:'
      || !careersUrl.hostname
      || careersUrl.username
      || careersUrl.password
    ) {
      throw new Error(`Job source ${index + 1} careersUrl must be a valid HTTPS URL.`)
    }
    if (provider === 'greenhouse') {
      requiredText(source.boardToken, `Job source ${index + 1} boardToken`)
    } else {
      requiredText(source.siteName, `Job source ${index + 1} siteName`)
    }
    if (
      source.excludeListingIds !== undefined
      && (
        !Array.isArray(source.excludeListingIds)
        || source.excludeListingIds.some((id) => typeof id !== 'string' || !id.trim())
        || new Set(source.excludeListingIds.map((id) => id.trim())).size !== source.excludeListingIds.length
      )
    ) {
      throw new Error(`Job source ${index + 1} excludeListingIds must be an array of unique non-empty strings.`)
    }
    if (
      source.deactivateMissingListings !== undefined
      && typeof source.deactivateMissingListings !== 'boolean'
    ) {
      throw new Error(`Job source ${index + 1} deactivateMissingListings must be a boolean.`)
    }

    const sourceKey = `${provider}:${sourceCompany.toLocaleLowerCase('en-US')}`
    if (seenSources.has(sourceKey)) {
      throw new Error(`Job source ${index + 1} duplicates a provider/company entry.`)
    }
    seenSources.add(sourceKey)
    return { ...source, provider, sourceCompany, careersUrl: careersUrl.toString() }
  })
}

export function applyListingExclusions(source, listings) {
  const excludedIds = new Set((source.excludeListingIds || []).map((id) => id.trim()))
  const included = []
  const excluded = []

  for (const listing of listings) {
    if (excludedIds.has(String(listing.sourceListingId))) {
      excluded.push(listing)
    } else {
      included.push(listing)
    }
  }

  return { included, excluded }
}

function validateMappedJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new Error('Official job source returned an invalid job collection.')
  }
  const seenIds = new Set()
  for (const job of jobs) {
    if (
      !String(job.sourceListingId || '').trim()
      || !job.title
      || !job.description
      || !job.externalApplicationUrl
      || !job.sourceUrl
    ) {
      throw new Error('Official job source returned a job without its ID, title, description, or official URLs.')
    }
    if (seenIds.has(job.sourceListingId)) {
      throw new Error(`Official job source returned duplicate external ID "${job.sourceListingId}".`)
    }
    seenIds.add(job.sourceListingId)
  }
  return seenIds
}

async function readKnownListings(JobModel, source) {
  return JobModel.find({
    sourceProvider: source.provider,
    sourceCompany: source.sourceCompany,
  })
    .select('sourceListingId')
    .lean()
}

function createSourceRecord(source, listing, checkedAt) {
  const record = {
    ...listing,
    companyName: source.sourceCompany,
    sourceCompany: source.sourceCompany,
    sourceCareersUrl: source.careersUrl,
    sourceProvider: source.provider,
    sourceName: `${source.provider === 'greenhouse' ? 'Greenhouse' : 'Lever'} employer career feed`,
    lastCheckedAt: checkedAt,
    importKey: createImportKey({
      sourceName: `${source.provider}:${source.sourceCompany}`,
      sourceListingId: listing.sourceListingId,
    }),
  }
  if (!record.salary) delete record.salary
  if (!record.postingDate) delete record.postingDate
  return record
}

function createSourceUpdate(source, listing, checkedAt) {
  const unset = {}
  for (const field of [
    'postingDate',
    'sourceFirstPublishedAt',
    'sourceUpdatedAt',
    'salary',
    'location',
    'experienceLevel',
    'employmentType',
  ]) {
    if (!Object.hasOwn(listing, field)) unset[field] = 1
  }
  if (!source.careersUrl) unset.sourceCareersUrl = 1

  const update = {
    $set: createSourceRecord(source, listing, checkedAt),
    $setOnInsert: { isActive: false },
  }
  if (Object.keys(unset).length) update.$unset = unset
  return update
}

export async function syncJobSources(
  sources,
  {
    JobModel,
    fetchImpl = fetch,
    now = () => new Date(),
    apply = false,
  } = {},
) {
  if (!JobModel) throw new Error('A job model is required for source synchronization.')
  const preparedSources = []

  for (const source of sources) {
    const fetcher = sourceFetchers[source.provider]
    const feedListings = await fetcher(source, fetchImpl)
    validateMappedJobs(feedListings)
    const { included: listings, excluded } = applyListingExclusions(source, feedListings)
    const foundIds = validateMappedJobs(listings)
    const existing = await readKnownListings(JobModel, source)
    if (feedListings.length === 0 && existing.length > 0 && source.allowEmptyResult !== true) {
      throw new Error(
        `Empty result for ${source.provider}/${source.sourceCompany}; set allowEmptyResult only after confirming the employer feed is intentionally empty.`,
      )
    }

    const existingIds = new Set(existing.map((job) => String(job.sourceListingId)))
    const removedIds = [...existingIds].filter((id) => !foundIds.has(id))
    const checkedAt = now()
    const result = {
      provider: source.provider,
      sourceCompany: source.sourceCompany,
      found: feedListings.length,
      excluded: excluded.length,
      included: listings.length,
      new: listings.filter((job) => !existingIds.has(job.sourceListingId)).length,
      refreshed: listings.filter((job) => existingIds.has(job.sourceListingId)).length,
      missingFromFeed: removedIds.length,
      confirmedRemoved: source.deactivateMissingListings === true ? removedIds.length : 0,
      deactivated: apply && source.deactivateMissingListings === true ? removedIds.length : 0,
      applied: apply,
    }

    preparedSources.push({ source, listings, removedIds, checkedAt, result })
  }

  if (apply) {
    for (const { source, listings, removedIds, checkedAt } of preparedSources) {
      for (const listing of listings) {
        await JobModel.updateOne(
          {
            sourceProvider: source.provider,
            sourceCompany: source.sourceCompany,
            sourceListingId: listing.sourceListingId,
          },
          createSourceUpdate(source, listing, checkedAt),
          { upsert: true, runValidators: true, setDefaultsOnInsert: false },
        )
      }

      if (removedIds.length && source.deactivateMissingListings === true) {
        await JobModel.updateMany(
          {
            sourceProvider: source.provider,
            sourceCompany: source.sourceCompany,
            sourceListingId: { $in: removedIds },
            isActive: true,
          },
          { $set: { isActive: false, lastCheckedAt: checkedAt } },
        )
      }
    }
  }

  return preparedSources.map(({ result }) => result)
}

export async function inspectOfficialJobSources(sources, { fetchImpl = fetch } = {}) {
  const inspected = []

  for (const source of sources) {
    const fetcher = sourceFetchers[source.provider]
    const feedListings = await fetcher(source, fetchImpl)
    validateMappedJobs(feedListings)
    const { included, excluded } = applyListingExclusions(source, feedListings)
    inspected.push({
      provider: source.provider,
      sourceCompany: source.sourceCompany,
      found: feedListings.length,
      included: included.length,
      excluded: excluded.map(({ sourceListingId, title }) => ({ sourceListingId, title })),
      listings: included.map(({
        sourceListingId,
        title,
        location,
        employmentType,
        experienceLevel,
        postingDate,
        salary,
        externalApplicationUrl,
      }) => ({
        sourceListingId,
        title,
        ...(location ? { location } : {}),
        ...(employmentType ? { employmentType } : {}),
        ...(experienceLevel ? { experienceLevel } : {}),
        ...(postingDate ? { postingDate } : {}),
        ...(salary ? { salary } : {}),
        externalApplicationUrl,
      })),
    })
  }

  return inspected
}
