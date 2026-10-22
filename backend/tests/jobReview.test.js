import test from 'node:test'
import assert from 'node:assert/strict'
import jobRoutes from '../routes/jobRoutes.js'
import { reviewNetlifyListing } from '../controllers/jobReviewController.js'
import { jobReviewAuthMiddleware } from '../middleware/jobReviewAuthMiddleware.js'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

const validReview = {
  decision: 'approved',
  availability: 'available',
  publish: true,
}

test('job review authorization fails closed and attributes the configured reviewer', () => {
  const unavailableResponse = createResponse()
  jobReviewAuthMiddleware(
    { headers: { authorization: 'Bearer secret' } },
    unavailableResponse,
    () => assert.fail('unconfigured review auth must not continue'),
    { env: {} },
  )
  assert.equal(unavailableResponse.statusCode, 503)

  const invalidResponse = createResponse()
  jobReviewAuthMiddleware(
    { headers: { authorization: 'Bearer wrong' } },
    invalidResponse,
    () => assert.fail('invalid review auth must not continue'),
    { env: { JOB_REVIEW_API_TOKEN: 'secret', JOB_REVIEW_API_REVIEWER: 'Placement staff' } },
  )
  assert.equal(invalidResponse.statusCode, 401)

  const request = { headers: { authorization: 'Bearer secret' } }
  let nextCalled = false
  jobReviewAuthMiddleware(
    request,
    createResponse(),
    () => { nextCalled = true },
    { env: { JOB_REVIEW_API_TOKEN: 'secret', JOB_REVIEW_API_REVIEWER: ' Placement staff ' } },
  )
  assert.equal(nextCalled, true)
  assert.equal(request.jobReviewer, 'Placement staff')
})

test('review endpoint rejects IDs outside the approved Netlify role allowlist', async () => {
  let queried = false
  const response = createResponse()
  await reviewNetlifyListing(
    {
      params: { sourceListingId: '4224129002' },
      body: validReview,
      jobReviewer: 'Placement staff',
    },
    response,
    { JobModel: { findOneAndUpdate: () => { queried = true } } },
  )
  assert.equal(response.statusCode, 404)
  assert.equal(queried, false)
})

test('review endpoint requires explicit decision, availability, and publish values', async () => {
  for (const body of [
    {},
    { ...validReview, unexpected: true },
    { ...validReview, availability: 'unavailable' },
    { ...validReview, publish: 'true' },
  ]) {
    const response = createResponse()
    await reviewNetlifyListing(
      {
        params: { sourceListingId: '8806100002' },
        body,
        jobReviewer: 'Placement staff',
      },
      response,
      { JobModel: {} },
    )
    assert.equal(response.statusCode, 400)
  }
})

test('review endpoint publishes only with explicit approval and current availability', async () => {
  const reviewedAt = new Date('2026-10-22T04:00:00.000Z')
  const savedJob = { _id: 'job-id', title: 'Customer Success Associate' }
  let filter
  let update
  let options
  let projection
  const response = createResponse()

  await reviewNetlifyListing(
    {
      params: { sourceListingId: '8806100002' },
      body: validReview,
      jobReviewer: 'Placement staff',
    },
    response,
    {
      now: () => reviewedAt,
      JobModel: {
        findOneAndUpdate(query, changes, opts) {
          filter = query
          update = changes
          options = opts
          return {
            select(fields) {
              projection = fields
              return Promise.resolve(savedJob)
            },
          }
        },
      },
    },
  )

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, { success: true, job: savedJob })
  assert.equal(filter.sourceProvider, 'greenhouse')
  assert.equal(filter.sourceCompany, 'Netlify')
  assert.equal(filter.sourceListingId, '8806100002')
  assert.equal(filter.sourceCareersUrl, 'https://www.netlify.com/careers/')
  assert.equal(filter.sourceUrl.test('https://job-boards.greenhouse.io/netlify/jobs/8806100002'), true)
  assert.equal(filter.externalApplicationUrl.test('https://job-boards.greenhouse.io/netlify/jobs/8806100002'), true)
  assert.deepEqual(update.$set, {
    sourceReviewStatus: 'approved',
    sourceReviewAt: reviewedAt,
    sourceReviewBy: 'Placement staff',
    sourceReviewAvailability: 'available',
    availabilityConfirmedAt: reviewedAt,
    lastCheckedAt: reviewedAt,
    isActive: true,
  })
  assert.deepEqual(options, { new: true, runValidators: true })
  assert.match(projection, /sourceReviewStatus/)
})

test('a rejected or unavailable listing remains inactive and cannot satisfy the API gate', async () => {
  const reviewedAt = new Date('2026-10-22T04:00:00.000Z')
  let update
  const response = createResponse()
  await reviewNetlifyListing(
    {
      params: { sourceListingId: '8861222002' },
      body: { decision: 'rejected', availability: 'unavailable', publish: false },
      jobReviewer: 'Placement staff',
    },
    response,
    {
      now: () => reviewedAt,
      JobModel: {
        findOneAndUpdate(_filter, changes) {
          update = changes
          return { select: async () => ({ title: 'Senior role' }) }
        },
      },
    },
  )

  assert.equal(response.statusCode, 200)
  assert.equal(update.$set.sourceReviewStatus, 'rejected')
  assert.equal(update.$set.sourceReviewAvailability, 'unavailable')
  assert.equal(update.$set.availabilityConfirmedAt, null)
  assert.equal(update.$set.isActive, false)
})

test('Netlify review route is protected by review-token middleware', () => {
  const route = jobRoutes.stack.find(
    (layer) => layer.route?.path === '/review/netlify/:sourceListingId',
  )
  assert.ok(route)
  assert.equal(route.route.methods.post, true)
  assert.equal(route.route.stack[0].handle, jobReviewAuthMiddleware)
  assert.equal(route.route.stack[1].handle, reviewNetlifyListing)
})
