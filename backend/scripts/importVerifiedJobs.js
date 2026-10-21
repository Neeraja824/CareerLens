import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import Job from '../models/job.model.js'
import { AVAILABILITY_CONFIRMATION_MAX_AGE_MS } from '../utils/jobFilters.js'
import { createImportKey } from '../utils/importJobIdentity.js'

export { createImportKey }

const verificationAuthorities = new Set([
  'college_placement_office',
  'employer',
])

const acceptedFields = new Set([
  'title',
  'companyName',
  'description',
  'requiredSkills',
  'location',
  'experienceLevel',
  'employmentType',
  'externalApplicationUrl',
  'sourceName',
  'sourceUrl',
  'verifiedAt',
  'verifiedBy',
  'availabilityConfirmedAt',
  'sourceListingId',
  'postingDate',
  'expiryDate',
  'isActive',
])

const requiredStringFields = [
  'title',
  'companyName',
  'description',
  'location',
  'experienceLevel',
  'employmentType',
  'sourceName',
]

function normalizeText(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function normalizeSourceUrl(value) {
  const url = new URL(value.trim())
  url.hash = ''
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }
  return url.toString()
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizedTextPattern(value) {
  return new RegExp(
    `^\\s*${normalizeText(value).split(' ').map(escapeRegularExpression).join('\\s+')}\\s*$`,
    'i',
  )
}

function createImportSignature(record) {
  const document = new Job(record).toObject({ versionKey: false })
  delete document._id
  if (record.postingDate === undefined) delete document.postingDate

  const fields = [...acceptedFields].sort()
  const canonicalData = Object.fromEntries(
    fields
      .filter((field) => document[field] !== undefined)
      .map((field) => [
        field,
        ['companyName', 'title'].includes(field)
          ? normalizeText(document[field])
          : field === 'sourceUrl'
            ? normalizeSourceUrl(document[field])
            : document[field],
      ]),
  )
  return JSON.stringify(canonicalData)
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const timestampMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/,
  )
  const timestamp = Boolean(timestampMatch)
  if (!dateOnly && !timestamp) return false

  const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth) {
    return false
  }
  if (timestampMatch) {
    const [, , , , hour, minute, second, , offsetHour, offsetMinute] = timestampMatch
    if (
      Number(hour) > 23
      || Number(minute) > 59
      || Number(second) > 59
      || Number(offsetHour || 0) > 23
      || Number(offsetMinute || 0) > 59
    ) {
      return false
    }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return !dateOnly || parsed.toISOString().slice(0, 10) === value
}

function isRecentAvailabilityConfirmation(value) {
  if (typeof value !== 'string' || !value.includes('T') || !isValidIsoDate(value)) {
    return false
  }

  const confirmedAt = new Date(value).getTime()
  const age = Date.now() - confirmedAt
  return age >= 0 && age <= AVAILABILITY_CONFIRMATION_MAX_AGE_MS
}

export function validateImportRecord(record, index = 1) {
  const errors = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { errors: [`Record ${index}: expected a JSON object.`] }
  }

  for (const field of Object.keys(record)) {
    if (!acceptedFields.has(field)) {
      errors.push(`Record ${index}: unsupported field "${field}".`)
    }
  }

  for (const field of requiredStringFields) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      errors.push(`Record ${index}: ${field} is required and must be a non-empty string.`)
    }
  }

  if (record.verifiedAt === undefined || record.verifiedAt === null || record.verifiedAt === '') {
    errors.push(`Record ${index}: verifiedAt is required and must be a valid ISO date or timestamp.`)
  } else if (!isValidIsoDate(record.verifiedAt)) {
    errors.push(`Record ${index}: verifiedAt must be a valid ISO date or timestamp.`)
  }
  if (record.verifiedBy === undefined || record.verifiedBy === null || record.verifiedBy === '') {
    errors.push(`Record ${index}: verifiedBy is required; use college_placement_office or employer.`)
  } else if (!verificationAuthorities.has(record.verifiedBy)) {
    errors.push(`Record ${index}: verifiedBy "${record.verifiedBy ?? '(missing)'}" is invalid; use college_placement_office or employer.`)
  }
  if (record.isActive !== undefined && typeof record.isActive !== 'boolean') {
    errors.push(`Record ${index}: isActive must be a boolean.`)
  }
  if (
    record.availabilityConfirmedAt !== undefined
    && (
      typeof record.availabilityConfirmedAt !== 'string'
      || !record.availabilityConfirmedAt.includes('T')
      || !isValidIsoDate(record.availabilityConfirmedAt)
    )
  ) {
    errors.push(`Record ${index}: availabilityConfirmedAt must be a valid ISO timestamp.`)
  } else if (
    record.isActive === true
    && !isRecentAvailabilityConfirmation(record.availabilityConfirmedAt)
  ) {
    errors.push(
      `Record ${index}: isActive requires an availabilityConfirmedAt timestamp from the past 24 hours.`,
    )
  }

  for (const field of ['sourceUrl', 'externalApplicationUrl']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      errors.push(`Record ${index}: ${field} is required and must be an HTTP or HTTPS URL.`)
      continue
    }
    try {
      const url = new URL(record[field].trim())
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
        errors.push(`Record ${index}: ${field} must be an HTTP or HTTPS URL.`)
      }
    } catch {
      errors.push(`Record ${index}: ${field} must be an HTTP or HTTPS URL.`)
    }
  }

  if (errors.length > 0) return { errors }

  const validatedRecord = {
    ...record,
    isActive: record.isActive === true,
    availabilityConfirmedAt: record.availabilityConfirmedAt
      ? new Date(record.availabilityConfirmedAt)
      : null,
    sourceUrl: normalizeSourceUrl(record.sourceUrl),
    verifiedAt: new Date(record.verifiedAt),
  }
  if (record.postingDate !== undefined) {
    validatedRecord.postingDate = new Date(record.postingDate)
  }
  if (record.expiryDate !== undefined && record.expiryDate !== null) {
    validatedRecord.expiryDate = new Date(record.expiryDate)
  }

  const validationError = new Job(validatedRecord).validateSync()
  if (validationError) {
    errors.push(...Object.keys(validationError.errors).map(
      (field) => `Record ${index}: ${field} is invalid or missing.`,
    ))
    return { errors }
  }

  try {
    return {
      value: {
        ...validatedRecord,
        importKey: createImportKey(validatedRecord),
      },
      signature: createImportSignature(validatedRecord),
      errors: [],
    }
  } catch {
    return { errors: [`Record ${index}: sourceUrl cannot be normalized.`] }
  }
}

export function validateImportFile(contents) {
  const records = Array.isArray(contents) ? contents : contents?.jobs
  if (!Array.isArray(records)) {
    return {
      jobs: [],
      errors: ['The JSON file must contain an array or an object with a jobs array.'],
      identicalDuplicates: 0,
    }
  }

  const jobs = []
  const errors = []
  const seenKeys = new Map()
  let identicalDuplicates = 0
  records.forEach((record, index) => {
    const result = validateImportRecord(record, index + 1)
    if (result.errors.length) {
      errors.push(...result.errors)
      return
    }

    const previous = seenKeys.get(result.value.importKey)
    if (!previous) {
      seenKeys.set(result.value.importKey, {
        index: index + 1,
        signature: result.signature,
      })
      jobs.push(result.value)
      return
    }

    if (previous.signature === result.signature) {
      identicalDuplicates += 1
      return
    }

    errors.push(
      `Records ${previous.index} and ${index + 1} generate the same importer key but contain conflicting job data.`,
    )
  })

  return { jobs, errors, identicalDuplicates }
}

async function findLegacyDuplicate(job, JobModel) {
  const candidates = await JobModel.find({
    importKey: { $exists: false },
    companyName: normalizedTextPattern(job.companyName),
    title: normalizedTextPattern(job.title),
  })
    .select('companyName title sourceUrl')
    .lean()

  let possibleDuplicate = false
  for (const candidate of candidates) {
    if (typeof candidate.sourceUrl !== 'string') {
      return { uncertain: true }
    }

    try {
      if (normalizeSourceUrl(candidate.sourceUrl) === normalizeSourceUrl(job.sourceUrl)) {
        possibleDuplicate = true
      }
    } catch {
      return { uncertain: true }
    }
  }

  return { possibleDuplicate, uncertain: false }
}

export async function importJobRecords(jobs, JobModel = Job) {
  const errors = []
  const legacyDuplicates = []
  let inserted = 0
  let skipped = 0

  for (const [index, job] of jobs.entries()) {
    try {
      let legacyResult
      try {
        legacyResult = await findLegacyDuplicate(job, JobModel)
      } catch {
        errors.push(`Record ${index + 1}: legacy duplicate check failed; record was not inserted.`)
        continue
      }

      if (legacyResult.uncertain) {
        errors.push(
          `Record ${index + 1}: legacy duplicate status is uncertain because a matching legacy record has an invalid or missing source URL; record was not inserted.`,
        )
        continue
      }
      if (legacyResult.possibleDuplicate) {
        skipped += 1
        legacyDuplicates.push(`Record ${index + 1}: possible legacy duplicate found; skipped without modifying it.`)
        continue
      }

      const result = await JobModel.updateOne(
        { importKey: job.importKey },
        { $setOnInsert: job },
        { upsert: true },
      )
      if (result.upsertedCount === 1 || result.upsertedId) inserted += 1
      else skipped += 1
    } catch (error) {
      if (error?.code === 11000) {
        skipped += 1
      } else {
        errors.push(`Record ${index + 1}: import failed.`)
      }
    }
  }

  return { inserted, skipped, errors, legacyDuplicates }
}

function printDryRunSummary(validation, output) {
  output.log('DRY RUN - no database connection or writes will be performed.')
  output.log(`Valid job records: ${validation.jobs.length}`)

  for (const [index, job] of validation.jobs.entries()) {
    const description = job.description.length > 240
      ? `${job.description.slice(0, 237).trimEnd()}...`
      : job.description
    output.log([
      `\nJob ${index + 1}: ${job.title}`,
      `  Company: ${job.companyName}`,
      `  Location: ${job.location}`,
      `  Experience: ${job.experienceLevel}`,
      `  Employment type: ${job.employmentType}`,
      `  Required skills: ${job.requiredSkills?.length ? job.requiredSkills.join(', ') : '(none listed)'}`,
      `  Description: ${description}`,
      `  Application URL: ${job.externalApplicationUrl}`,
      `  Source: ${job.sourceName} - ${job.sourceUrl}`,
      `  Verification metadata (user-supplied; not independently authenticated): ${job.verifiedBy}, ${job.verifiedAt.toISOString()}`,
      `  Availability confirmation (user-supplied; not independently authenticated): ${job.availabilityConfirmedAt?.toISOString() || '(not provided)'}`,
      `  Posting date: ${job.postingDate?.toISOString() || '(not provided)'}`,
      `  Expiry date: ${job.expiryDate?.toISOString() || '(not provided)'}`,
      `  Active: ${job.isActive ?? true}`,
      ...(!job.availabilityConfirmedAt
        ? ['  Note: no availability confirmation supplied; importer will keep this job inactive.']
        : []),
      ...((job.isActive ?? true)
        ? ['  Warning: the availability confirmation is user-supplied and current availability has not been independently confirmed.']
        : []),
    ].join('\n'))
  }

  if (validation.identicalDuplicates) {
    output.log(`Identical duplicate input records: ${validation.identicalDuplicates}`)
  }
  if (validation.errors.length) {
    output.error(`Validation errors (${validation.errors.length}):`)
    for (const error of validation.errors) output.error(`- ${error}`)
  }
  output.log('Preview validates input shape only; manually confirm listings are open and URLs are official.')
}

export async function runImporter(filePath, options = {}) {
  const {
    dryRun = false,
    output = console,
    readFile = (inputPath) => fs.readFile(inputPath, 'utf8'),
    connect = connectDatabase,
    ensureIndex = () => Job.collection.createIndex(
      { importKey: 1 },
      { unique: true, sparse: true, name: 'unique_job_import_key' },
    ),
    importRecords = (jobs) => importJobRecords(jobs),
  } = options
  let databaseConnected = false
  try {
    let contents
    try {
      contents = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      output.error('Unable to read or parse the specified JSON file.')
      return false
    }

    const validation = validateImportFile(contents)
    if (dryRun) {
      printDryRunSummary(validation, output)
      return validation.errors.length === 0
    }

    const { jobs, errors: validationErrors, identicalDuplicates } = validation
    if (identicalDuplicates) output.log(`Skipped ${identicalDuplicates} identical duplicate input record(s).`)
    for (const error of validationErrors) output.error(error)
    if (validationErrors.length) return false

    databaseConnected = await connect()
    if (!databaseConnected) return false

    try {
      await ensureIndex()
    } catch {
      output.error('Unable to prepare the unique importer index.')
      return false
    }

    const result = await importRecords(jobs)
    for (const error of result.errors) output.error(error)
    for (const duplicate of result.legacyDuplicates) output.warn(duplicate)
    output.log(`Verified job import complete: ${result.inserted} inserted, ${result.skipped} already present.`)
    return result.errors.length === 0
  } catch {
    output.error('Verified job import failed.')
    return false
  } finally {
    if (!dryRun && (databaseConnected || mongoose.connection.readyState !== 0)) {
      try {
        await mongoose.disconnect()
      } catch {
        output.error('Unable to close the MongoDB connection cleanly.')
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args[0] === '--dry-run'
  const filePath = dryRun ? args[1] : args[0]
  if (!filePath || args.length !== (dryRun ? 2 : 1)) {
    console.error('Usage: npm run import:verified-jobs -- [--dry-run] <json-file>')
    process.exitCode = 1
    return
  }

  if (!dryRun) await import('dotenv/config')
  const success = await runImporter(path.resolve(process.cwd(), filePath), { dryRun })
  if (!success) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main()
}
