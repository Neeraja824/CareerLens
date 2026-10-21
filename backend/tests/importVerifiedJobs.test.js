import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createImportKey,
  importJobRecords,
  runImporter,
  validateImportFile,
  validateImportRecord,
} from '../scripts/importVerifiedJobs.js'

function validRecord(overrides = {}) {
  return {
    title: 'Junior Software Engineer',
    companyName: 'Example Employer',
    description: 'Entry-level software engineering role.',
    requiredSkills: ['JavaScript', 'Node.js'],
    location: 'India',
    experienceLevel: 'Fresher',
    employmentType: 'Full-time',
    externalApplicationUrl: 'https://employer.example/careers/apply',
    sourceName: 'Example College Placement Office',
    sourceUrl: 'https://college.example/jobs/123',
    verifiedAt: '2026-10-13T10:00:00Z',
    verifiedBy: 'college_placement_office',
    ...overrides,
  }
}

function createOutputCapture() {
  const messages = []
  return {
    messages,
    output: {
      log: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
    },
  }
}

test('import validation accepts schema-valid records with verification metadata', () => {
  const result = validateImportRecord(validRecord())
  assert.deepEqual(result.errors, [])
  assert.equal(result.value.verifiedAt.toISOString(), '2026-10-13T10:00:00.000Z')
  assert.equal(result.value.isActive, false)
  assert.equal(result.value.availabilityConfirmedAt, null)
  assert.match(result.value.importKey, /^listing:/)
})

test('active imports require an availability confirmation from the past 24 hours', () => {
  for (const availabilityConfirmedAt of [
    undefined,
    new Date(Date.now() - (24 * 60 * 60 * 1000) - 1).toISOString(),
    new Date(Date.now() + 1000).toISOString(),
  ]) {
    const result = validateImportRecord(validRecord({
      isActive: true,
      availabilityConfirmedAt,
    }))
    assert.ok(result.errors.some((error) => error.includes(
      'isActive requires an availabilityConfirmedAt timestamp from the past 24 hours',
    )))
  }

  const malformed = validateImportRecord(validRecord({
    isActive: true,
    availabilityConfirmedAt: 'not-a-timestamp',
  }))
  assert.ok(malformed.errors.includes(
    'Record 1: availabilityConfirmedAt must be a valid ISO timestamp.',
  ))

  const confirmed = validateImportRecord(validRecord({
    isActive: true,
    availabilityConfirmedAt: new Date().toISOString(),
  }))
  assert.deepEqual(confirmed.errors, [])
  assert.equal(confirmed.value.isActive, true)
  assert.ok(confirmed.value.availabilityConfirmedAt instanceof Date)
})

test('inactive imports do not require availability confirmation', () => {
  const result = validateImportRecord(validRecord({ isActive: false }))
  assert.deepEqual(result.errors, [])
  assert.equal(result.value.isActive, false)
  assert.equal(result.value.availabilityConfirmedAt, null)
})

test('import validation rejects non-boolean active flags', () => {
  const result = validateImportRecord(validRecord({ isActive: 'true' }))
  assert.ok(result.errors.includes('Record 1: isActive must be a boolean.'))
})

test('import validation rejects missing schema fields and unconfirmed listings', () => {
  for (const record of [
    validRecord({ title: undefined }),
    validRecord({ verifiedAt: undefined }),
    validRecord({ verifiedBy: undefined }),
    validRecord({ verifiedBy: 'job-board' }),
    validRecord({ verifiedAt: 'not-a-date' }),
  ]) {
    assert.ok(validateImportRecord(record).errors.length > 0)
  }
})

test('import validation describes missing fields, invalid URLs, and verification metadata', () => {
  const result = validateImportRecord(validRecord({
    title: '',
    externalApplicationUrl: 'javascript:alert(1)',
    sourceUrl: undefined,
    verifiedAt: 'not-a-date',
    verifiedBy: 'job-board',
  }))

  assert.ok(result.errors.includes('Record 1: title is required and must be a non-empty string.'))
  assert.ok(result.errors.includes('Record 1: externalApplicationUrl must be an HTTP or HTTPS URL.'))
  assert.ok(result.errors.includes('Record 1: sourceUrl is required and must be an HTTP or HTTPS URL.'))
  assert.ok(result.errors.includes('Record 1: verifiedAt must be a valid ISO date or timestamp.'))
  assert.ok(result.errors.includes('Record 1: verifiedBy "job-board" is invalid; use college_placement_office or employer.'))

  const missingMetadata = validateImportRecord(validRecord({
    verifiedAt: undefined,
    verifiedBy: undefined,
  }))
  assert.ok(missingMetadata.errors.includes(
    'Record 1: verifiedAt is required and must be a valid ISO date or timestamp.',
  ))
  assert.ok(missingMetadata.errors.includes(
    'Record 1: verifiedBy is required; use college_placement_office or employer.',
  ))
})

test('import validation rejects non-HTTP application and source URLs', () => {
  for (const field of ['externalApplicationUrl', 'sourceUrl']) {
    for (const url of ['javascript:alert(1)', 'ftp://jobs.example/listing', 'not a URL']) {
      assert.ok(validateImportRecord(validRecord({ [field]: url })).errors.length > 0)
    }
  }
})

test('import file validation reports malformed records without dropping good ones', () => {
  const result = validateImportFile({ jobs: [validRecord(), null] })
  assert.equal(result.jobs.length, 1)
  assert.deepEqual(result.errors, ['Record 2: expected a JSON object.'])
  assert.equal(result.identicalDuplicates, 0)
  assert.ok(validateImportFile({ records: [] }).errors.length > 0)
})

test('identical fallback-key records are counted and retained only once', () => {
  const result = validateImportFile([
    validRecord(),
    validRecord({
      companyName: '  EXAMPLE EMPLOYER ',
      title: 'junior software engineer',
      sourceUrl: 'https://COLLEGE.example:443/jobs/123/#details',
    }),
  ])

  assert.equal(result.jobs.length, 1)
  assert.equal(result.identicalDuplicates, 1)
  assert.deepEqual(result.errors, [])
})

test('conflicting records sharing an external or fallback key fail validation', () => {
  for (const [first, second] of [
    [
      validRecord({ sourceListingId: 'shared-id' }),
      validRecord({ sourceListingId: 'shared-id', description: 'Different role details.' }),
    ],
    [
      validRecord(),
      validRecord({ externalApplicationUrl: 'https://employer.example/another-apply' }),
    ],
  ]) {
    const result = validateImportFile([first, second])
    assert.equal(result.jobs.length, 1)
    assert.equal(result.identicalDuplicates, 0)
    assert.deepEqual(result.errors, [
      'Records 1 and 2 generate the same importer key but contain conflicting job data.',
    ])
  }
})

test('deduplication key uses external ID when provided and normalized fallback otherwise', () => {
  const record = validRecord()
  assert.equal(
    createImportKey(record),
    createImportKey(validRecord({
      companyName: '  EXAMPLE   EMPLOYER ',
      title: ' junior  software ENGINEER ',
      sourceUrl: 'https://COLLEGE.example:443/jobs/123/#details',
    })),
  )

  const identifiedRecord = validRecord({ sourceListingId: 'abc-123' })
  assert.match(
    createImportKey(identifiedRecord),
    /^external:[a-f\d]{64}$/,
  )
})

test('repeated imports are idempotent and existing records are not overwritten', async () => {
  const recordsByKey = new Map()
  const modelStub = {
    find() {
      return {
        select() { return this },
        lean: async () => [],
      }
    },
    async updateOne(filter, update, options) {
      assert.equal(options.upsert, true)
      assert.deepEqual(Object.keys(update), ['$setOnInsert'])
      if (recordsByKey.has(filter.importKey)) return { upsertedCount: 0 }
      recordsByKey.set(filter.importKey, update.$setOnInsert)
      return { upsertedCount: 1 }
    },
  }

  const job = validateImportRecord(validRecord()).value
  const firstRun = await importJobRecords([job], modelStub)
  const secondRun = await importJobRecords([job], modelStub)
  assert.deepEqual(firstRun, { inserted: 1, skipped: 0, errors: [], legacyDuplicates: [] })
  assert.deepEqual(secondRun, { inserted: 0, skipped: 1, errors: [], legacyDuplicates: [] })
  assert.equal(recordsByKey.size, 1)
  assert.equal(recordsByKey.get(job.importKey).title, 'Junior Software Engineer')
})

test('legacy match is reported and skipped without an update', async () => {
  let capturedFilter
  let updateCalled = false
  const job = validateImportRecord(validRecord()).value
  const modelStub = {
    find(filter) {
      capturedFilter = filter
      return {
        select(fields) {
          assert.equal(fields, 'companyName title sourceUrl')
          return this
        },
        lean: async () => [{
          companyName: '  EXAMPLE   EMPLOYER ',
          title: 'junior software ENGINEER',
          sourceUrl: 'https://COLLEGE.example:443/jobs/123/#legacy',
        }],
      }
    },
    async updateOne() {
      updateCalled = true
    },
  }

  const result = await importJobRecords([job], modelStub)
  assert.equal(capturedFilter.importKey.$exists, false)
  assert.ok(capturedFilter.companyName instanceof RegExp)
  assert.ok(capturedFilter.title instanceof RegExp)
  assert.equal(updateCalled, false)
  assert.deepEqual(result, {
    inserted: 0,
    skipped: 1,
    errors: [],
    legacyDuplicates: ['Record 1: possible legacy duplicate found; skipped without modifying it.'],
  })
})

test('failed legacy lookup reports uncertainty and prevents insertion', async () => {
  let updateCalled = false
  const job = validateImportRecord(validRecord()).value
  const modelStub = {
    find() {
      throw new Error('Synthetic lookup failure')
    },
    async updateOne() {
      updateCalled = true
    },
  }

  const result = await importJobRecords([job], modelStub)
  assert.equal(updateCalled, false)
  assert.deepEqual(result, {
    inserted: 0,
    skipped: 0,
    errors: ['Record 1: legacy duplicate check failed; record was not inserted.'],
    legacyDuplicates: [],
  })
})

test('dry-run previews valid records without connecting, indexing, or writing', async () => {
  const { messages, output } = createOutputCapture()
  let databaseOperationCalled = false
  const success = await runImporter('illustrative-jobs.json', {
    dryRun: true,
    output,
    readFile: async () => JSON.stringify({ jobs: [validRecord()] }),
    connect: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not connect')
    },
    ensureIndex: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not create an index')
    },
    importRecords: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not write records')
    },
  })

  assert.equal(success, true)
  assert.equal(databaseOperationCalled, false)
  assert.ok(messages.some((message) => message.includes('DRY RUN - no database connection or writes')))
  assert.ok(messages.some((message) => message.includes('Job 1: Junior Software Engineer')))
  assert.ok(messages.some((message) => message.includes('Application URL: https://employer.example/careers/apply')))
  assert.ok(messages.some((message) => message.includes('Active: false')))
  assert.ok(messages.some((message) => message.includes(
    'no availability confirmation supplied; importer will keep this job inactive',
  )))
  assert.ok(messages.some((message) => message.includes(
    'Verification metadata (user-supplied; not independently authenticated): college_placement_office',
  )))
})

test('dry-run does not warn about current availability for inactive records', async () => {
  const { messages, output } = createOutputCapture()
  const success = await runImporter('inactive-jobs.json', {
    dryRun: true,
    output,
    readFile: async () => JSON.stringify({ jobs: [validRecord({ isActive: false })] }),
  })

  assert.equal(success, true)
  assert.ok(messages.some((message) => message.includes('Active: false')))
  assert.ok(!messages.some((message) => message.includes(
    'current availability has not been independently confirmed',
  )))
})

test('dry-run labels active availability confirmation as user-supplied', async () => {
  const { messages, output } = createOutputCapture()
  const success = await runImporter('confirmed-jobs.json', {
    dryRun: true,
    output,
    readFile: async () => JSON.stringify({
      jobs: [validRecord({
        isActive: true,
        availabilityConfirmedAt: new Date().toISOString(),
      })],
    }),
  })

  assert.equal(success, true)
  assert.ok(messages.some((message) => message.includes('Active: true')))
  assert.ok(messages.some((message) => message.includes(
    'Availability confirmation (user-supplied; not independently authenticated):',
  )))
  assert.ok(messages.some((message) => message.includes(
    'current availability has not been independently confirmed',
  )))
})

test('invalid dry-run reports validation errors without connecting or writing', async () => {
  const { messages, output } = createOutputCapture()
  let databaseOperationCalled = false
  const success = await runImporter('invalid-jobs.json', {
    dryRun: true,
    output,
    readFile: async () => JSON.stringify({
      jobs: [validRecord({
        title: '',
        externalApplicationUrl: 'javascript:alert(1)',
        verifiedBy: 'job-board',
      })],
    }),
    connect: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not connect')
    },
    ensureIndex: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not create an index')
    },
    importRecords: async () => {
      databaseOperationCalled = true
      throw new Error('Dry run must not write records')
    },
  })

  assert.equal(success, false)
  assert.equal(databaseOperationCalled, false)
  assert.ok(messages.some((message) => message.includes('title is required')))
  assert.ok(messages.some((message) => message.includes('externalApplicationUrl must be an HTTP or HTTPS URL')))
  assert.ok(messages.some((message) => message.includes('verifiedBy "job-board" is invalid')))
  assert.ok(messages.some((message) => message.includes('Validation errors')))
})
