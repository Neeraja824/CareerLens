import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Student from '../models/student.model.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

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

async function withOverrides(overrides, run) {
  const originals = overrides.map(({ target, key, value }) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, { configurable: true, writable: true, value })
    return { target, key, descriptor }
  })

  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'unit-test-secret'

  try {
    await run()
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret

    for (const { target, key, descriptor } of originals.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete target[key]
    }
  }
}

function override(target, key, value) {
  return { target, key, value }
}

test('auth middleware keeps missing and invalid tokens as 401', async () => {
  const response = createResponse()
  let nextCalled = false

  await authMiddleware({ headers: {} }, response, () => { nextCalled = true })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalled, false)

  await withOverrides([
    override(jwt, 'verify', () => { throw new Error('invalid token') }),
    override(mongoose.connection, 'readyState', 1),
  ], async () => {
    const invalidResponse = createResponse()
    await authMiddleware(
      { headers: { authorization: 'Bearer invalid-token' } },
      invalidResponse,
      () => { nextCalled = true },
    )

    assert.equal(invalidResponse.statusCode, 401)
    assert.equal(nextCalled, false)
  })
})

test('auth middleware returns 503 before lookup when MongoDB is not ready', async () => {
  let lookupCalled = false

  await withOverrides([
    override(jwt, 'verify', () => ({ id: 'student-id' })),
    override(mongoose.connection, 'readyState', 0),
    override(Student, 'findById', () => { lookupCalled = true }),
  ], async () => {
    const response = createResponse()
    await authMiddleware(
      { headers: { authorization: 'Bearer valid-token' } },
      response,
      () => assert.fail('next should not be called'),
    )

    assert.equal(response.statusCode, 503)
    assert.equal(response.body.message, 'Database unavailable. Please try again later.')
    assert.equal(lookupCalled, false)
  })
})

test('auth middleware returns 503 when student lookup fails', async () => {
  await withOverrides([
    override(jwt, 'verify', () => ({ id: 'student-id' })),
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findById', () => ({
      select: async () => { throw new Error('database lookup failed') },
    })),
  ], async () => {
    const response = createResponse()
    await authMiddleware(
      { headers: { authorization: 'Bearer valid-token' } },
      response,
      () => assert.fail('next should not be called'),
    )

    assert.equal(response.statusCode, 503)
    assert.match(response.body.message, /temporarily unavailable/i)
  })
})

test('auth middleware preserves inactive-account rejection and valid authorization', async () => {
  const activeStudent = {
    _id: { toString: () => 'student-id' },
    email: 'student@example.test',
    role: 'student',
    isActive: true,
    toObject: () => ({ email: 'student@example.test', role: 'student', isActive: true }),
  }

  await withOverrides([
    override(jwt, 'verify', () => ({ id: 'student-id' })),
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findById', () => ({ select: async () => activeStudent })),
  ], async () => {
    const response = createResponse()
    let nextCalled = false
    const request = { headers: { authorization: 'Bearer valid-token' } }

    await authMiddleware(request, response, () => { nextCalled = true })

    assert.equal(response.statusCode, 200)
    assert.equal(nextCalled, true)
    assert.equal(request.student.id, 'student-id')
    assert.equal(request.student.email, 'student@example.test')
  })

  await withOverrides([
    override(jwt, 'verify', () => ({ id: 'student-id' })),
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findById', () => ({
      select: async () => ({ isActive: false }),
    })),
  ], async () => {
    const response = createResponse()
    await authMiddleware(
      { headers: { authorization: 'Bearer valid-token' } },
      response,
      () => assert.fail('next should not be called for inactive student'),
    )

    assert.equal(response.statusCode, 401)
    assert.equal(response.body.message, 'Invalid or inactive account.')
  })
})
