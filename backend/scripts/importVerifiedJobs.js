import 'dotenv/config'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import Job from '../models/job.model.js'

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
  'sourceListingId',
  'postingDate',
  'expiryDate',
  'isActive',
])

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

export function createImportKey(job) {
  let identity
  let prefix
  if (job.sourceListingId) {
    prefix = 'external'
    identity = [normalizeText(job.sourceName), job.sourceListingId.trim()]
  } else {
    prefix = 'listing'
    identity = [
      normalizeText(job.companyName),
      normalizeText(job.title),
      normalizeSourceUrl(job.sourceUrl),
    ]
  }

  // IDs use the source-scoped stable listing ID when present. The fallback
  // hashes normalized employer/title and canonical source URL as a tuple.
  const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  return `${prefix}:${digest}`
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

  if (!isValidIsoDate(record.verifiedAt)) {
    errors.push(`Record ${index}: verifiedAt must be a valid ISO date or timestamp.`)
  }
  if (!verificationAuthorities.has(record.verifiedBy)) {
    errors.push(`Record ${index}: verifiedBy must be college_placement_office or employer.`)
  }

  for (const field of ['sourceUrl', 'externalApplicationUrl']) {
    if (typeof record[field] !== 'string') continue
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

async function runImporter(filePath) {
  let databaseConnected = false
  try {
    let contents
    try {
      contents = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch {
      console.error('Unable to read or parse the specified JSON file.')
      return false
    }

    const {
      jobs,
      errors: validationErrors,
      identicalDuplicates,
    } = validateImportFile(contents)
    if (identicalDuplicates) {
      console.log(`Skipped ${identicalDuplicates} identical duplicate input record(s).`)
    }
    for (const error of validationErrors) console.error(error)
    if (validationErrors.length) return false

    databaseConnected = await connectDatabase()
    if (!databaseConnected) return false

    try {
      await Job.collection.createIndex(
        { importKey: 1 },
        { unique: true, sparse: true, name: 'unique_job_import_key' },
      )
    } catch {
      console.error('Unable to prepare the unique importer index.')
      return false
    }

    const result = await importJobRecords(jobs)
    for (const error of result.errors) console.error(error)
    for (const duplicate of result.legacyDuplicates) console.warn(duplicate)
    console.log(`Verified job import complete: ${result.inserted} inserted, ${result.skipped} already present.`)
    return result.errors.length === 0
  } catch {
    console.error('Verified job import failed.')
    return false
  } finally {
    if (databaseConnected || mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect()
      } catch {
        console.error('Unable to close the MongoDB connection cleanly.')
      }
    }
  }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath || process.argv.length !== 3) {
    console.error('Usage: npm run import:verified-jobs -- <json-file>')
    process.exitCode = 1
    return
  }

  const success = await runImporter(path.resolve(process.cwd(), filePath))
  if (!success) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main()
}
