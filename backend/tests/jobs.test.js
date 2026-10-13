import test from 'node:test'
import assert from 'node:assert/strict'

import Job from '../models/job.model.js'
import { getJobById, getJobs, validateJobListQuery } from '../controllers/jobController.js'

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

function withJobStubs(stubs, run) {
  const originals = Object.fromEntries(Object.keys(stubs).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(Job, key),
  ]))
  Object.assign(Job, stubs)

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(Job, key, descriptor)
        else delete Job[key]
      }
    })
}

test('job query validation applies defaults and parses listing filters', () => {
  const result = validateJobListQuery({
    keyword: '  engineer ',
    location: 'Remote',
    skills: 'React, Node.js',
    experienceLevel: 'Mid-level',
    employmentType: 'Full-time',
    page: '2',
    limit: '10',
  })

  assert.deepEqual(result, {
    value: {
      keyword: 'engineer',
      location: 'Remote',
      skills: ['React', 'Node.js'],
      experienceLevel: 'Mid-level',
      employmentType: 'Full-time',
      page: 2,
      limit: 10,
    },
  })
  assert.deepEqual(validateJobListQuery({}).value, {
    keyword: undefined,
    location: undefined,
    skills: undefined,
    experienceLevel: undefined,
    employmentType: undefined,
    page: 1,
    limit: 20,
  })
})

test('job query validation rejects malformed, repeated, oversized, and unknown values', () => {
  for (const query of [
    { page: '0' },
    { limit: '101' },
    { keyword: ['engineer', 'designer'] },
    { skills: 'React,,Node.js' },
    { skills: Array.from({ length: 21 }, (_, index) => `Skill${index}`).join(',') },
    { unknown: 'value' },
  ]) {
    assert.ok(validateJobListQuery(query).error, JSON.stringify(query))
  }
})

test('job listing applies active and unexpired criteria, filters, and pagination', async () => {
  let capturedFilter
  let capturedOptions
  const expectedJobs = [{ title: 'Engineer' }]
  const queryChain = {
    sort(value) {
      capturedOptions = { sort: value }
      return this
    },
    skip(value) {
      capturedOptions.skip = value
      return this
    },
    limit(value) {
      capturedOptions.limit = value
      return this
    },
    lean() {
      return Promise.resolve(expectedJobs)
    },
  }

  await withJobStubs({
    find(filter) {
      capturedFilter = filter
      return queryChain
    },
    countDocuments: async () => 23,
  }, async () => {
    const response = createResponse()
    await getJobs({
      query: {
        keyword: 'C++',
        location: 'New York',
        skills: 'React,Node.js',
        experienceLevel: 'Senior',
        employmentType: 'Full-time',
        page: '3',
        limit: '5',
      },
    }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.success, true)
    assert.deepEqual(response.body.jobs, expectedJobs)
    assert.deepEqual(response.body.pagination, {
      page: 3,
      limit: 5,
      totalJobs: 23,
      totalPages: 5,
    })
  })

  assert.equal(capturedFilter.isActive, true)
  assert.ok(capturedFilter.$or.some((condition) => condition.expiryDate === null))
  assert.equal(capturedFilter.$or.some((condition) => condition.expiryDate?.$gte instanceof Date), true)
  assert.equal(capturedFilter.$and[0].$or[0].title.source, 'C\\+\\+')
  assert.equal(capturedFilter.location.$options, 'i')
  assert.equal(capturedFilter.experienceLevel.$options, 'i')
  assert.equal(capturedFilter.employmentType.$options, 'i')
  assert.equal(capturedFilter.requiredSkills.$in.length, 2)
  assert.deepEqual(capturedOptions, {
    sort: { postingDate: -1, _id: -1 },
    skip: 10,
    limit: 5,
  })
})

test('job listing excludes inactive and expired records', async () => {
  const records = [
    { _id: 'active-no-expiry', isActive: true, expiryDate: null },
    { _id: 'active-future-expiry', isActive: true, expiryDate: new Date(Date.now() + 86400000) },
    { _id: 'inactive-no-expiry', isActive: false, expiryDate: null },
    { _id: 'active-expired', isActive: true, expiryDate: new Date(Date.now() - 86400000) },
  ]
  let matchedRecords
  const queryChain = {
    sort() { return this },
    skip() { return this },
    limit() { return this },
    lean() { return Promise.resolve(matchedRecords) },
  }

  await withJobStubs({
    find(filter) {
      const expiryMinimum = filter.$or.find(
        (condition) => condition.expiryDate?.$gte instanceof Date,
      ).expiryDate.$gte
      const allowsNoExpiry = filter.$or.some((condition) => condition.expiryDate === null)
      matchedRecords = records.filter((job) => (
        job.isActive === filter.isActive
        && (job.expiryDate === null ? allowsNoExpiry : job.expiryDate >= expiryMinimum)
      ))
      return queryChain
    },
    countDocuments: async () => matchedRecords.length,
  }, async () => {
    const response = createResponse()
    await getJobs({ query: {} }, response)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body.jobs.map((job) => job._id), [
      'active-no-expiry',
      'active-future-expiry',
    ])
    assert.equal(response.body.pagination.totalJobs, 2)
  })
})

test('job listing rejects invalid input before querying the model', async () => {
  let wasQueried = false
  await withJobStubs({
    find() {
      wasQueried = true
      throw new Error('Should not query on invalid input')
    },
  }, async () => {
    const response = createResponse()
    await getJobs({ query: { limit: '1000' } }, response)
    assert.equal(response.statusCode, 400)
    assert.equal(response.body.success, false)
  })
  assert.equal(wasQueried, false)
})

test('job lookup returns an active, unexpired job and rejects invalid or missing IDs', async () => {
  const jobId = '507f1f77bcf86cd799439011'
  let capturedFilter
  const foundJob = { _id: jobId, title: 'Frontend Engineer' }
  const queryChain = { lean: async () => foundJob }

  await withJobStubs({
    findOne(filter) {
      capturedFilter = filter
      return queryChain
    },
  }, async () => {
    const response = createResponse()
    await getJobById({ params: { id: jobId } }, response)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body.job, foundJob)
  })

  assert.equal(capturedFilter._id, jobId)
  assert.equal(capturedFilter.isActive, true)
  assert.ok(capturedFilter.$or.some((condition) => condition.expiryDate?.$gte instanceof Date))

  let wasQueried = false
  await withJobStubs({
    findOne() {
      wasQueried = true
      return { lean: async () => null }
    },
  }, async () => {
    const invalidResponse = createResponse()
    await getJobById({ params: { id: 'not-an-object-id' } }, invalidResponse)
    assert.equal(invalidResponse.statusCode, 400)

    const missingResponse = createResponse()
    await getJobById({ params: { id: '507f1f77bcf86cd799439012' } }, missingResponse)
    assert.equal(missingResponse.statusCode, 404)
  })
  assert.equal(wasQueried, true)
})
