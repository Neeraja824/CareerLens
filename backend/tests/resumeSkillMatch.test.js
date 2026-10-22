import test from 'node:test'
import assert from 'node:assert/strict'

import Job from '../models/job.model.js'
import Resume from '../models/resume.model.js'
import { getJobMatch, getRecommendedJobs } from '../controllers/jobController.js'
import jobRoutes from '../routes/jobRoutes.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { calculateResumeSkillMatch } from '../utils/resumeSkillMatch.js'

const readyResume = (skills) => ({
  isCurrent: true,
  status: 'analysis-ready',
  skills,
})

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

async function withModelStubs(stubs, run) {
  const originals = Object.fromEntries(Object.entries(stubs).map(([modelName, modelStubs]) => [
    modelName,
    Object.fromEntries(Object.keys(modelStubs).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(modelName === 'Job' ? Job : Resume, key),
    ])),
  ]))

  for (const [modelName, modelStubs] of Object.entries(stubs)) {
    Object.assign(modelName === 'Job' ? Job : Resume, modelStubs)
  }

  try {
    await run()
  } finally {
    for (const [modelName, descriptors] of Object.entries(originals)) {
      const model = modelName === 'Job' ? Job : Resume
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(model, key, descriptor)
        else delete model[key]
      }
    }
  }
}

function createModelQuery(value, onSelect) {
  return {
    select(fields) {
      onSelect?.(fields)
      return this
    },
    lean: async () => value,
  }
}

test('resume skill match handles exact matches and partial match percentages', () => {
  assert.deepEqual(
    calculateResumeSkillMatch(readyResume(['React', 'Node.js']), ['React', 'Node.js']),
    {
      status: 'available',
      matchPercentage: 100,
      matchedSkills: ['React', 'Node.js'],
      missingSkills: [],
      message: 'Resume skill match calculated from the analyzed resume skills.',
    },
  )
  assert.deepEqual(
    calculateResumeSkillMatch(readyResume(['React', 'SQL']), ['React', 'Node.js', 'SQL', 'Python']),
    {
      status: 'available',
      matchPercentage: 50,
      matchedSkills: ['React', 'SQL'],
      missingSkills: ['Node.js', 'Python'],
      message: 'Resume skill match calculated from the analyzed resume skills.',
    },
  )
})

test('resume skill match normalizes case and whitespace and ignores duplicates', () => {
  const result = calculateResumeSkillMatch(
    readyResume(['  rEaCt  ', 'React', ' NODE.JS ', '   ']),
    [' React ', 'REACT', 'Node.js', ' Python '],
  )

  assert.equal(result.matchPercentage, 67)
  assert.deepEqual(result.matchedSkills, ['React', 'Node.js'])
  assert.deepEqual(result.missingSkills, ['Python'])
})

test('resume skill match returns zero for no overlap and empty resume skills', () => {
  const noOverlap = calculateResumeSkillMatch(readyResume(['Go', 'Rust']), ['React', 'SQL'])
  assert.equal(noOverlap.matchPercentage, 0)
  assert.deepEqual(noOverlap.matchedSkills, [])
  assert.deepEqual(noOverlap.missingSkills, ['React', 'SQL'])

  const emptyResume = calculateResumeSkillMatch(readyResume([]), ['React', 'SQL'])
  assert.equal(emptyResume.matchPercentage, 0)
  assert.deepEqual(emptyResume.matchedSkills, [])
  assert.deepEqual(emptyResume.missingSkills, ['React', 'SQL'])
})

test('resume skill match returns non-comparable for jobs without unique required skills', () => {
  const result = calculateResumeSkillMatch(readyResume(['React']), [' ', ''])

  assert.equal(result.status, 'not_comparable')
  assert.equal(result.matchPercentage, null)
  assert.deepEqual(result.matchedSkills, [])
  assert.deepEqual(result.missingSkills, [])
})

test('resume skill match is unavailable without a current analysis-ready resume', () => {
  for (const resume of [
    null,
    { isCurrent: true, status: 'pending-analysis', skills: ['React'] },
    { isCurrent: false, status: 'analysis-ready', skills: ['React'] },
  ]) {
    const result = calculateResumeSkillMatch(resume, ['React'])
    assert.equal(result.status, 'unavailable')
    assert.equal(result.matchPercentage, null)
    assert.deepEqual(result.matchedSkills, [])
    assert.deepEqual(result.missingSkills, [])
    assert.match(result.message, /No analysis-ready current resume/)
  }
})

test('matching endpoint uses the authenticated student and returns only match data', async () => {
  const jobId = '507f1f77bcf86cd799439011'
  let jobFilter
  let resumeFilter
  let jobProjection
  let resumeProjection

  await withModelStubs({
    Job: {
      findOne(filter) {
        jobFilter = filter
        return createModelQuery(
          { _id: jobId, title: 'Engineer', requiredSkills: ['React', 'Node.js', 'SQL'] },
          (fields) => { jobProjection = fields },
        )
      },
    },
    Resume: {
      findOne(filter) {
        resumeFilter = filter
        let selectedFields = []
        return {
          select(fields) {
            resumeProjection = fields
            selectedFields = fields.split(/\s+/)
            return this
          },
          async lean() {
            const projectedResume = readyResume(['React', 'SQL', 'JavaScript'])
            return Object.fromEntries(
              selectedFields
                .filter((field) => field in projectedResume)
                .map((field) => [field, projectedResume[field]]),
            )
          },
        }
      },
    },
  }, async () => {
    const response = createResponse()
    await getJobMatch({
      params: { id: jobId },
      student: { id: 'authenticated-student-id' },
      query: { studentId: 'attacker-supplied-id' },
    }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, {
      success: true,
      job: { id: jobId, title: 'Engineer' },
      resumeSkillMatch: {
        status: 'available',
        matchPercentage: 67,
        matchedSkills: ['React', 'SQL'],
        missingSkills: ['Node.js'],
        message: 'Resume skill match calculated from the analyzed resume skills.',
      },
    })
  })

  assert.equal(jobFilter._id, jobId)
  assert.equal(jobFilter.isActive, true)
  assert.ok(jobFilter.availabilityConfirmedAt.$gte instanceof Date)
  assert.ok(jobFilter.availabilityConfirmedAt.$lte instanceof Date)
  assert.ok(jobFilter.$or.some((condition) => condition.expiryDate?.$gte instanceof Date))
  assert.deepEqual(jobFilter.$and[0].$or[0].$and[1].verifiedAt, { $ne: null })
  assert.deepEqual(jobFilter.$and[0].$or[0].$and[1].verifiedBy, { $in: ['college_placement_office', 'employer'] })
  assert.deepEqual(jobFilter.sourceProvider, { $in: ['greenhouse', 'lever'] })
  assert.ok(jobFilter.lastCheckedAt.$gte instanceof Date)
  assert.ok(jobFilter.lastCheckedAt.$lte instanceof Date)
  assert.equal(jobProjection, 'title requiredSkills')
  assert.deepEqual(resumeFilter, {
    userId: 'authenticated-student-id',
    isCurrent: true,
  })
  assert.equal(resumeProjection, 'isCurrent status skills')
})

test('matching endpoint returns unavailable when the current resume is missing or not ready', async () => {
  for (const resume of [
    null,
    { isCurrent: true, status: 'pending-analysis', skills: ['React'] },
  ]) {
    await withModelStubs({
      Job: {
        findOne() {
          return createModelQuery({
            _id: '507f1f77bcf86cd799439011',
            title: 'Engineer',
            requiredSkills: ['React'],
          })
        },
      },
      Resume: {
        findOne() {
          return createModelQuery(resume)
        },
      },
    }, async () => {
      const response = createResponse()
      await getJobMatch({
        params: { id: '507f1f77bcf86cd799439011' },
        student: { id: 'authenticated-student-id' },
      }, response)
      assert.equal(response.statusCode, 200)
      assert.equal(response.body.resumeSkillMatch.status, 'unavailable')
      assert.equal(response.body.resumeSkillMatch.matchPercentage, null)
    })
  }
})

test('recommendations use the authenticated current resume and rank verified active listings by score', async () => {
  let capturedResumeFilter
  let capturedResumeProjection
  let capturedJobsFilter
  const jobs = [
    { _id: 'newest', title: 'Newest role', requiredSkills: ['Go'], postingDate: new Date('2026-06-03') },
    { _id: 'partial', title: 'Partial role', requiredSkills: ['React', 'Node.js'], postingDate: new Date('2026-06-02') },
    { _id: 'best', title: 'Best role', requiredSkills: ['React'], postingDate: new Date('2026-06-01') },
  ]

  await withModelStubs({
    Job: {
      find(filter) {
        capturedJobsFilter = filter
        return {
          sort(sort) {
            assert.deepEqual(sort, { postingDate: -1, _id: -1 })
            return this
          },
          lean: async () => jobs,
        }
      },
    },
    Resume: {
      findOne(filter) {
        capturedResumeFilter = filter
        return {
          select(fields) {
            capturedResumeProjection = fields
            return this
          },
          lean: async () => readyResume(['React']),
        }
      },
    },
  }, async () => {
    const response = createResponse()
    await getRecommendedJobs({
      student: { id: 'authenticated-student-id' },
      query: { studentId: 'attacker-supplied-id' },
    }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.resumeStatus, 'analysis-ready')
    assert.deepEqual(response.body.recommendations.map((job) => [job._id, job.resumeSkillMatch.matchPercentage]), [
      ['best', 100],
      ['partial', 50],
      ['newest', 0],
    ])
  })

  assert.deepEqual(capturedResumeFilter, { userId: 'authenticated-student-id', isCurrent: true })
  assert.equal(capturedResumeProjection, 'isCurrent status skills')
  assert.equal(capturedJobsFilter.isActive, true)
  assert.ok(capturedJobsFilter.availabilityConfirmedAt.$gte instanceof Date)
  assert.ok(capturedJobsFilter.availabilityConfirmedAt.$lte instanceof Date)
  assert.ok(capturedJobsFilter.$or.some((condition) => condition.expiryDate?.$gte instanceof Date))
  assert.deepEqual(capturedJobsFilter.$and[0].$or[0].$and[1].verifiedBy, { $in: ['college_placement_office', 'employer'] })
  assert.deepEqual(capturedJobsFilter.$and[0].$or[0].$and[1].verifiedAt, { $ne: null })
  assert.deepEqual(capturedJobsFilter.sourceProvider, { $in: ['greenhouse', 'lever'] })
  assert.ok(capturedJobsFilter.lastCheckedAt.$gte instanceof Date)
  assert.ok(capturedJobsFilter.lastCheckedAt.$lte instanceof Date)
})

test('recommendations mark missing or pending resumes and unscorable jobs without inventing a score', async () => {
  for (const [resume, expectedStatus] of [
    [null, 'missing'],
    [{ isCurrent: true, status: 'pending-analysis', skills: ['React'] }, 'analysis-pending'],
  ]) {
    await withModelStubs({
      Job: {
        find() {
          return { sort() { return this }, lean: async () => [{ _id: 'verified', requiredSkills: [] }] }
        },
      },
      Resume: {
        findOne() {
          return { select() { return this }, lean: async () => resume }
        },
      },
    }, async () => {
      const response = createResponse()
      await getRecommendedJobs({ student: { id: 'authenticated-student-id' } }, response)
      assert.equal(response.statusCode, 200)
      assert.equal(response.body.resumeStatus, expectedStatus)
      assert.equal(response.body.recommendations[0].resumeSkillMatch.matchPercentage, null)
      assert.deepEqual(response.body.recommendations[0].resumeSkillMatch.matchedSkills, [])
      assert.deepEqual(response.body.recommendations[0].resumeSkillMatch.missingSkills, [])
    })
  }
})

test('matching endpoint rejects invalid IDs without querying models', async () => {
  let queried = false
  await withModelStubs({
    Job: {
      findOne() {
        queried = true
        throw new Error('Invalid ID should not query')
      },
    },
  }, async () => {
    const response = createResponse()
    await getJobMatch({ params: { id: 'invalid-id' } }, response)
    assert.equal(response.statusCode, 400)
    assert.equal(response.body.success, false)
  })
  assert.equal(queried, false)
})

test('matching endpoint returns not found for missing, inactive, and expired jobs', async () => {
  let capturedFilter
  await withModelStubs({
    Job: {
      findOne(filter) {
        capturedFilter = filter
        return createModelQuery(null)
      },
    },
    Resume: {
      findOne() {
        throw new Error('Resume must not be queried for a missing job')
      },
    },
  }, async () => {
    const response = createResponse()
    await getJobMatch({
      params: { id: '507f1f77bcf86cd799439011' },
      student: { id: 'authenticated-student-id' },
    }, response)
    assert.equal(response.statusCode, 404)
    assert.equal(response.body.message, 'Job listing not found.')
  })

  assert.equal(capturedFilter.isActive, true)
  assert.ok(capturedFilter.availabilityConfirmedAt.$gte instanceof Date)
  assert.ok(capturedFilter.availabilityConfirmedAt.$lte instanceof Date)
  assert.ok(capturedFilter.$or.some((condition) => condition.expiryDate === null))
  assert.ok(capturedFilter.$or.some((condition) => condition.expiryDate?.$gte instanceof Date))
  assert.deepEqual(capturedFilter.$and[0].$or[0].$and[1].verifiedAt, { $ne: null })
  assert.deepEqual(capturedFilter.$and[0].$or[0].$and[1].verifiedBy, { $in: ['college_placement_office', 'employer'] })
  assert.deepEqual(capturedFilter.sourceProvider, { $in: ['greenhouse', 'lever'] })
  assert.ok(capturedFilter.lastCheckedAt.$gte instanceof Date)
  assert.ok(capturedFilter.lastCheckedAt.$lte instanceof Date)
})

test('matching endpoint requires authentication and existing job routes stay public', async () => {
  const recommendedRoute = jobRoutes.stack.find((layer) => layer.route?.path === '/recommended')
  const matchRoute = jobRoutes.stack.find((layer) => layer.route?.path === '/:id/match')
  const listRoute = jobRoutes.stack.find((layer) => layer.route?.path === '/')
  const detailRoute = jobRoutes.stack.find((layer) => layer.route?.path === '/:id')

  assert.equal(recommendedRoute.route.stack[0].handle, authMiddleware)
  assert.equal(matchRoute.route.stack[0].handle, authMiddleware)
  assert.equal(listRoute.route.stack.length, 1)
  assert.equal(detailRoute.route.stack.length, 1)

  const response = createResponse()
  let nextCalled = false
  await authMiddleware({ headers: {} }, response, () => { nextCalled = true })
  assert.equal(response.statusCode, 401)
  assert.equal(response.body.success, false)
  assert.equal(nextCalled, false)
})
