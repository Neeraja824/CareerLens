import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchGreenhouseJobs } from '../services/jobSources/greenhouse.js'
import { fetchLeverJobs } from '../services/jobSources/lever.js'
import { sourceDate, sourceSalary } from '../services/jobSources/common.js'
import { parseJobSourceConfig, syncJobSources } from '../services/jobSyncService.js'
import { runFeedInspection } from '../scripts/inspectOfficialJobFeeds.js'
import { runOfficialJobSync } from '../scripts/syncOfficialJobs.js'
import Job from '../models/job.model.js'

function greenhouseSource(overrides = {}) {
  return {
    provider: 'greenhouse',
    sourceCompany: 'Example Org',
    boardToken: 'example-board',
    careersUrl: 'https://example.org/careers',
    ...overrides,
  }
}

function greenhousePayload(jobs = []) {
  return { jobs }
}

function responseWith(payload, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => payload,
  }
}

function createJobModel(existing = []) {
  const writes = { updates: [], updateMany: [] }
  return {
    writes,
    find(filter) {
      return {
        select() {
          return this
        },
        lean: async () => existing.filter((job) => (
          job.sourceProvider === filter.sourceProvider
          && job.sourceCompany === filter.sourceCompany
        )),
      }
    },
    updateOne: async (...args) => writes.updates.push(args),
    updateMany: async (...args) => writes.updateMany.push(args),
  }
}

function applyExistingUpdate(document, update) {
  const result = { ...document, ...update.$set }
  for (const field of Object.keys(update.$unset || {})) delete result[field]
  return result
}

const validGreenhouseListing = {
  id: 123,
  title: 'Software Engineer',
  content: '<p>Build software safely.</p>',
  absolute_url: 'https://boards.greenhouse.io/example-board/jobs/123',
  location: { name: 'Remote' },
}

test('source configuration accepts supported providers and rejects unsafe or duplicate configuration', () => {
  assert.deepEqual(
    parseJobSourceConfig(JSON.stringify([greenhouseSource()])).map(({ provider, sourceCompany }) => ({
      provider,
      sourceCompany,
    })),
    [{ provider: 'greenhouse', sourceCompany: 'Example Org' }],
  )

  for (const source of [
    greenhouseSource({ provider: 'unknown' }),
    greenhouseSource({ excludeListingIds: '4224129002' }),
    greenhouseSource({ excludeListingIds: ['4224129002', '4224129002'] }),
    greenhouseSource({ deactivateMissingListings: 'true' }),
    greenhouseSource({ careersUrl: 'http://example.org/careers' }),
    greenhouseSource({ careersUrl: 'https://user:password@example.org/careers' }),
    greenhouseSource({ boardToken: '' }),
  ]) {
    assert.throws(() => parseJobSourceConfig(JSON.stringify([source])))
  }
  assert.throws(() => parseJobSourceConfig(JSON.stringify([
    greenhouseSource(),
    greenhouseSource({ sourceCompany: 'example org' }),
  ])), /duplicates/)
  assert.deepEqual(parseJobSourceConfig(undefined), [])
})

test('Greenhouse adapter maps only supplied job details and requires complete source payloads', async () => {
  const publishedAt = '2026-09-25T15:44:24-04:00'
  const updatedAt = '2026-10-02T19:03:23-04:00'
  const createdAt = '2026-09-24T10:00:00-04:00'
  const jobs = await fetchGreenhouseJobs(
    greenhouseSource(),
    async () => responseWith(greenhousePayload([{
      ...validGreenhouseListing,
      created_at: createdAt,
      first_published: publishedAt,
      updated_at: updatedAt,
    }])),
  )
  assert.equal(jobs[0].sourceListingId, '123')
  assert.equal(jobs[0].description, 'Build software safely.')
  assert.equal(jobs[0].location, 'Remote')
  assert.equal(jobs[0].experienceLevel, undefined)
  assert.equal(jobs[0].employmentType, undefined)
  assert.equal(jobs[0].sourceUrl, validGreenhouseListing.absolute_url)
  assert.equal(jobs[0].postingDate.toISOString(), new Date(createdAt).toISOString())
  assert.equal(jobs[0].sourceFirstPublishedAt.toISOString(), new Date(publishedAt).toISOString())
  assert.equal(jobs[0].sourceUpdatedAt.toISOString(), new Date(updatedAt).toISOString())

  const withoutSourceDates = await fetchGreenhouseJobs(
    greenhouseSource(),
    async () => responseWith(greenhousePayload([validGreenhouseListing])),
  )
  assert.equal(withoutSourceDates[0].postingDate, undefined)
  assert.equal(withoutSourceDates[0].sourceFirstPublishedAt, undefined)
  assert.equal(withoutSourceDates[0].sourceUpdatedAt, undefined)

  const withInvalidSourceDates = await fetchGreenhouseJobs(
    greenhouseSource(),
    async () => responseWith(greenhousePayload([{
      ...validGreenhouseListing,
      created_at: 'invalid-date',
      first_published: null,
      updated_at: 'invalid-date',
    }])),
  )
  assert.equal(withInvalidSourceDates[0].postingDate, undefined)
  assert.equal(withInvalidSourceDates[0].sourceFirstPublishedAt, undefined)
  assert.equal(withInvalidSourceDates[0].sourceUpdatedAt, undefined)
  assert.equal(withInvalidSourceDates[0].employmentType, undefined)
  assert.equal(withInvalidSourceDates[0].experienceLevel, undefined)

  await assert.rejects(
    fetchGreenhouseJobs(greenhouseSource(), async () => responseWith({})),
    /complete jobs array/,
  )
  await assert.rejects(
    fetchGreenhouseJobs(greenhouseSource(), async () => responseWith({ jobs: null })),
    /complete jobs array/,
  )
  await assert.rejects(
    fetchGreenhouseJobs(greenhouseSource(), async () => responseWith({}, false)),
    /HTTP 503/,
  )
  await assert.rejects(
    fetchGreenhouseJobs(
      greenhouseSource(),
      async () => responseWith(greenhousePayload([{ ...validGreenhouseListing, id: undefined }])),
    ),
    /external ID/,
  )
  await assert.rejects(
    fetchGreenhouseJobs(
      greenhouseSource(),
      async () => responseWith(greenhousePayload([{
        ...validGreenhouseListing,
        absolute_url: 'https://attacker.example/example-board/jobs/123',
      }])),
    ),
    /does not match the configured official board/,
  )
})

test('source date and salary parsing omit malformed or incomplete data', () => {
  assert.equal(sourceDate('2026-02-30'), undefined)
  assert.equal(sourceDate('not-a-date'), undefined)
  assert.equal(sourceDate('2026-02-28').toISOString(), '2026-02-28T00:00:00.000Z')
  assert.equal(sourceDate(0).toISOString(), '1970-01-01T00:00:00.000Z')
  assert.equal(sourceSalary({ min: '', max: 50000, currency: 'USD', interval: 'yearly' }), undefined)
  assert.deepEqual(
    sourceSalary({ min: '40000', max: '50000', currency: 'usd', interval: 'yearly' }),
    { min: 40000, max: 50000, currency: 'USD', interval: 'year' },
  )
})

test('job schema allows optional source details while retaining required job content', () => {
  const job = new Job({
    title: 'Software Engineer',
    companyName: 'Example Org',
    description: 'Build software.',
    externalApplicationUrl: 'https://boards.greenhouse.io/example-board/jobs/123',
    sourceName: 'Greenhouse employer career feed',
    sourceUrl: 'https://boards.greenhouse.io/example-board/jobs/123',
    sourceProvider: 'greenhouse',
    sourceCompany: 'Example Org',
    sourceListingId: '123',
    sourceCareersUrl: 'https://example.org/careers',
    sourceFirstPublishedAt: new Date('2026-09-25T15:44:24.000Z'),
    sourceUpdatedAt: new Date('2026-10-02T19:03:23.000Z'),
  })
  assert.equal(job.validateSync(), undefined)
  assert.equal(new Job({
    title: 'Software Engineer',
    companyName: 'Example Org',
    description: 'Build software.',
    externalApplicationUrl: 'https://boards.greenhouse.io/example-board/jobs/123',
    sourceName: 'Greenhouse employer career feed',
    sourceUrl: 'https://boards.greenhouse.io/example-board/jobs/123',
  }).validateSync(), undefined)
})

test('Lever adapter maps source categories and omits absent classifications', async () => {
  const jobs = await fetchLeverJobs(
    { siteName: 'example-board' },
    async () => responseWith([{
      id: 'abc-123',
      text: 'Platform Engineer',
      descriptionPlain: 'Maintain systems.',
      hostedUrl: 'https://jobs.lever.co/example-board/abc-123',
      categories: { location: 'Remote', commitment: 'Full-time', level: 'Entry level' },
    }]),
  )
  assert.equal(jobs[0].location, 'Remote')
  assert.equal(jobs[0].employmentType, 'Full-time')
  assert.equal(jobs[0].experienceLevel, 'Entry level')

  const withoutCategories = await fetchLeverJobs(
    { siteName: 'example-board' },
    async () => responseWith([{
      id: 'abc-124',
      text: 'Engineer',
      descriptionPlain: 'Build software.',
      hostedUrl: 'https://jobs.lever.co/example-board/abc-124',
    }]),
  )
  assert.equal(withoutCategories[0].location, undefined)
  assert.equal(withoutCategories[0].employmentType, undefined)
  assert.equal(withoutCategories[0].experienceLevel, undefined)

  await assert.rejects(
    fetchLeverJobs(
      { siteName: 'example-board' },
      async () => responseWith({ postings: [] }),
    ),
    /complete postings array/,
  )
  await assert.rejects(
    fetchLeverJobs(
      { siteName: 'example-board' },
      async () => responseWith([{
        id: 'bad-url',
        text: 'Engineer',
        descriptionPlain: 'Build software.',
        hostedUrl: 'http://jobs.lever.co/example-board/bad-url',
      }]),
    ),
    /HTTPS URL/,
  )
  await assert.rejects(
    fetchLeverJobs(
      { siteName: 'example-board' },
      async () => responseWith([{
        id: 'wrong-board',
        text: 'Engineer',
        descriptionPlain: 'Build software.',
        hostedUrl: 'https://jobs.lever.co/other-board/wrong-board',
      }]),
    ),
    /does not match the configured official site/,
  )
})

test('standalone inspection applies only explicitly configured listing ID exclusions', async () => {
  const configJson = JSON.stringify([greenhouseSource({
    sourceCompany: 'Netlify',
    boardToken: 'netlify',
    careersUrl: 'https://www.netlify.com/careers/',
    excludeListingIds: ['4224129002'],
  })])
  const output = { messages: [], errors: [] }
  output.log = (message) => output.messages.push(String(message))
  output.error = (message) => output.errors.push(String(message))
  let requestUrl = ''
  const inspectionSuccess = await runFeedInspection({
    configJson,
    output,
    fetchImpl: async (url) => {
      requestUrl = url
      return responseWith(greenhousePayload([
        {
          ...validGreenhouseListing,
          id: 4224129002,
          title: 'Your Chance to Join Our Talent Community!',
          absolute_url: 'https://boards.greenhouse.io/netlify/jobs/4224129002',
        },
        {
          ...validGreenhouseListing,
          id: 8806100002,
          title: 'Customer Success Associate',
          absolute_url: 'https://job-boards.greenhouse.io/netlify/jobs/8806100002',
        },
      ]))
    },
  })

  assert.equal(inspectionSuccess, true)
  assert.match(requestUrl, /^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/netlify\/jobs/)
  const report = JSON.parse(output.messages[0])
  assert.equal(report[0].found, 2)
  assert.equal(report[0].included, 1)
  assert.deepEqual(report[0].excluded, [{
    sourceListingId: '4224129002',
    title: 'Your Chance to Join Our Talent Community!',
  }])
  assert.deepEqual(report[0].listings.map(({ sourceListingId }) => sourceListingId), ['8806100002'])
  assert.match(output.messages[1], /no environment files, database, or local records/)
  assert.deepEqual(output.errors, [])
})

test('standalone inspection rejects missing configuration and malformed feeds', async () => {
  const output = { messages: [], errors: [] }
  output.log = (message) => output.messages.push(String(message))
  output.error = (message) => output.errors.push(String(message))
  assert.equal(await runFeedInspection({ configJson: '[]', output }), false)
  assert.match(output.errors[0], /at least one source/)

  const feedSuccess = await runFeedInspection({
    configJson: JSON.stringify([greenhouseSource()]),
    output,
    fetchImpl: async () => responseWith({ jobs: null }),
  })
  assert.equal(feedSuccess, false)
  assert.match(output.errors[1], /complete jobs array/)
})

test('dry-run reports source changes without writing job records', async () => {
  const JobModel = createJobModel([
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: '123' },
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: 'removed' },
  ])
  const result = await syncJobSources(
    [greenhouseSource()],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      apply: false,
    },
  )

  assert.deepEqual(result.map(({ found, new: newCount, refreshed, missingFromFeed, confirmedRemoved, deactivated }) => ({
    found,
    newCount,
    refreshed,
    missingFromFeed,
    confirmedRemoved,
    deactivated,
  })), [{
    found: 1,
    newCount: 0,
    refreshed: 1,
    missingFromFeed: 1,
    confirmedRemoved: 0,
    deactivated: 0,
  }])
  assert.equal(JobModel.writes.updates.length, 0)
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('apply refreshes and upserts listings, then deactivates only confirmed removals', async () => {
  const JobModel = createJobModel([
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: 'removed', isActive: true },
  ])
  const checkedAt = new Date('2027-01-02T03:04:05.000Z')
  await syncJobSources(
    [greenhouseSource({ deactivateMissingListings: true })],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      now: () => checkedAt,
      apply: true,
    },
  )

  assert.equal(JobModel.writes.updates.length, 1)
  const [filter, update, options] = JobModel.writes.updates[0]
  assert.equal(filter.sourceListingId, '123')
  assert.equal(update.$set.isActive, undefined)
  assert.equal(update.$set.verifiedBy, undefined)
  assert.equal(update.$set.verifiedAt, undefined)
  assert.equal(update.$set.availabilityConfirmedAt, undefined)
  assert.deepEqual(update.$setOnInsert, { isActive: false })
  assert.equal(update.$set.lastCheckedAt, checkedAt)
  assert.equal(update.$set.sourceCareersUrl, 'https://example.org/careers')
  assert.equal(update.$set.sourceUrl, validGreenhouseListing.absolute_url)
  assert.equal(update.$set.externalApplicationUrl, validGreenhouseListing.absolute_url)
  assert.deepEqual(update.$unset, {
    postingDate: 1,
    sourceFirstPublishedAt: 1,
    sourceUpdatedAt: 1,
    salary: 1,
    experienceLevel: 1,
    employmentType: 1,
  })
  assert.equal(options.upsert, true)
  assert.equal(JobModel.writes.updateMany.length, 1)
  assert.deepEqual(JobModel.writes.updateMany[0][0].sourceListingId, { $in: ['removed'] })
  assert.equal(JobModel.writes.updateMany[0][1].$set.isActive, false)
})

test('feed refresh preserves existing verification and fresh availability confirmation', async () => {
  const checkedAt = new Date('2027-01-02T03:04:05.000Z')
  const existing = {
    sourceProvider: 'greenhouse',
    sourceCompany: 'Example Org',
    sourceListingId: '123',
    isActive: true,
    verifiedAt: new Date('2026-12-31T03:04:05.000Z'),
    verifiedBy: 'college_placement_office',
    availabilityConfirmedAt: new Date('2027-01-02T02:04:05.000Z'),
  }
  const JobModel = createJobModel([existing])

  await syncJobSources(
    [greenhouseSource()],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      now: () => checkedAt,
      apply: true,
    },
  )

  const [, update] = JobModel.writes.updates[0]
  const refreshed = applyExistingUpdate(existing, update)
  assert.equal(refreshed.isActive, true)
  assert.equal(refreshed.verifiedAt, existing.verifiedAt)
  assert.equal(refreshed.verifiedBy, existing.verifiedBy)
  assert.equal(refreshed.availabilityConfirmedAt, existing.availabilityConfirmedAt)
  assert.equal(refreshed.lastCheckedAt, checkedAt)
})

test('feed refresh preserves stale availability without refreshing its timestamp', async () => {
  const checkedAt = new Date('2027-01-02T03:04:05.000Z')
  const existing = {
    sourceProvider: 'greenhouse',
    sourceCompany: 'Example Org',
    sourceListingId: '123',
    isActive: true,
    verifiedAt: new Date('2026-12-31T03:04:05.000Z'),
    verifiedBy: 'employer',
    availabilityConfirmedAt: new Date('2027-01-01T02:04:05.000Z'),
  }
  const JobModel = createJobModel([existing])

  await syncJobSources(
    [greenhouseSource()],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      now: () => checkedAt,
      apply: true,
    },
  )

  const [, update] = JobModel.writes.updates[0]
  const refreshed = applyExistingUpdate(existing, update)
  assert.equal(refreshed.isActive, true)
  assert.equal(refreshed.availabilityConfirmedAt, existing.availabilityConfirmedAt)
  assert.equal(refreshed.verifiedAt, existing.verifiedAt)
  assert.equal(refreshed.verifiedBy, existing.verifiedBy)
  assert.equal(refreshed.lastCheckedAt, checkedAt)
})

test('new feed listings are inserted inactive and without verification or availability claims', async () => {
  const JobModel = createJobModel()
  await syncJobSources(
    [greenhouseSource()],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      apply: true,
    },
  )

  const [, update] = JobModel.writes.updates[0]
  assert.equal(update.$setOnInsert.isActive, false)
  for (const field of ['verifiedAt', 'verifiedBy', 'availabilityConfirmedAt', 'isActive']) {
    assert.equal(Object.hasOwn(update.$set, field), false)
    assert.equal(Object.hasOwn(update.$unset || {}, field), false)
  }
})

test('missing listings are not deactivated by default, even during apply', async () => {
  const JobModel = createJobModel([
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: 'removed', isActive: true },
  ])
  const results = await syncJobSources(
    [greenhouseSource()],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
      apply: true,
    },
  )

  assert.equal(results[0].missingFromFeed, 1)
  assert.equal(results[0].confirmedRemoved, 0)
  assert.equal(results[0].deactivated, 0)
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('sync never upserts an explicitly excluded listing', async () => {
  const JobModel = createJobModel()
  await syncJobSources(
    [greenhouseSource({ excludeListingIds: ['123'] })],
    {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload([
        validGreenhouseListing,
        {
          ...validGreenhouseListing,
          id: 124,
          absolute_url: 'https://boards.greenhouse.io/example-board/jobs/124',
        },
      ])),
      apply: true,
    },
  )

  assert.equal(JobModel.writes.updates.length, 1)
  assert.equal(JobModel.writes.updates[0][0].sourceListingId, '124')
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('failed upserts do not begin missing-listing deactivation', async () => {
  const JobModel = createJobModel([
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: 'removed', isActive: true },
  ])
  JobModel.updateOne = async () => {
    throw new Error('simulated write failure')
  }

  await assert.rejects(
    syncJobSources(
      [greenhouseSource({ deactivateMissingListings: true })],
      {
        JobModel,
        fetchImpl: async () => responseWith(greenhousePayload([validGreenhouseListing])),
        apply: true,
      },
    ),
    /simulated write failure/,
  )
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('all configured feeds validate before any apply writes begin', async () => {
  const JobModel = createJobModel()
  const sources = [
    greenhouseSource(),
    {
      provider: 'lever',
      sourceCompany: 'Other Example Org',
      siteName: 'other-example',
      careersUrl: 'https://other.example/careers',
    },
  ]
  let request = 0
  await assert.rejects(
    syncJobSources(sources, {
      JobModel,
      apply: true,
      fetchImpl: async () => {
        request += 1
        return request === 1
          ? responseWith(greenhousePayload([validGreenhouseListing]))
          : responseWith(null, false)
      },
    }),
    /HTTP 503/,
  )
  assert.equal(JobModel.writes.updates.length, 0)
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('duplicate listing IDs in a source response fail before apply writes', async () => {
  const JobModel = createJobModel()
  await assert.rejects(
    syncJobSources([greenhouseSource()], {
      JobModel,
      apply: true,
      fetchImpl: async () => responseWith(greenhousePayload([
        validGreenhouseListing,
        validGreenhouseListing,
      ])),
    }),
    /duplicate external ID/,
  )
  assert.equal(JobModel.writes.updates.length, 0)
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('empty feeds with known listings fail closed unless explicitly allowed', async () => {
  const JobModel = createJobModel([
    { sourceProvider: 'greenhouse', sourceCompany: 'Example Org', sourceListingId: '123' },
  ])
  await assert.rejects(
    syncJobSources([greenhouseSource()], {
      JobModel,
      fetchImpl: async () => responseWith(greenhousePayload()),
      apply: true,
    }),
    /Empty result/,
  )
  assert.equal(JobModel.writes.updateMany.length, 0)
})

test('sync CLI defaults to read-only dry-run and blocks apply unless explicitly enabled', async () => {
  const messages = []
  let connectCalls = 0
  let disconnectCalls = 0
  const config = JSON.stringify([greenhouseSource()])
  const output = {
    log: (message) => messages.push(String(message)),
    error: (message) => messages.push(String(message)),
  }
  const dryRunModel = createJobModel()
  const dryRunSuccess = await runOfficialJobSync({
    env: { JOB_SOURCE_CONFIG_JSON: config, JOB_SYNC_ENABLED: 'false' },
    output,
    connect: async () => {
      connectCalls += 1
      return true
    },
    disconnect: async () => {
      disconnectCalls += 1
    },
    JobModel: dryRunModel,
    fetchImpl: async () => responseWith(greenhousePayload()),
  })
  assert.equal(dryRunSuccess, true)
  assert.equal(connectCalls, 1)
  assert.equal(disconnectCalls, 1)
  assert.ok(messages.some((message) => message.includes('DRY RUN')))
  assert.equal(dryRunModel.writes.updates.length, 0)

  const blockedApply = await runOfficialJobSync({
    apply: true,
    env: { JOB_SOURCE_CONFIG_JSON: config, JOB_SYNC_ENABLED: 'false' },
    output,
    connect: async () => {
      throw new Error('must not connect')
    },
  })
  assert.equal(blockedApply, false)
  assert.ok(messages.some((message) => message.includes('Writes are disabled')))
})
