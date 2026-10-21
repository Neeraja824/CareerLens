import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Student from '../models/student.model.js'
import { loginStudent } from '../controllers/authController.js'

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
  const originalExpiry = process.env.JWT_EXPIRES_IN
  process.env.JWT_SECRET = 'unit-test-secret'
  delete process.env.JWT_EXPIRES_IN

  try {
    await run()
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
    if (originalExpiry === undefined) delete process.env.JWT_EXPIRES_IN
    else process.env.JWT_EXPIRES_IN = originalExpiry

    for (const { target, key, descriptor } of originals.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete target[key]
    }
  }
}

function override(target, key, value) {
  return { target, key, value }
}

const loginRequest = {
  body: { email: 'STUDENT@example.test', password: 'correct-password' },
}

test('login returns 503 without querying students while MongoDB is not ready', async () => {
  let lookupCalled = false

  await withOverrides([
    override(mongoose.connection, 'readyState', 0),
    override(Student, 'findOne', () => { lookupCalled = true }),
  ], async () => {
    const response = createResponse()
    await loginStudent(loginRequest, response)

    assert.equal(response.statusCode, 503)
    assert.equal(response.body.message, 'Database unavailable. Please try again later.')
    assert.equal(lookupCalled, false)
  })
})

test('login preserves the successful response and token payload', async () => {
  const student = {
    _id: { toString: () => 'student-id' },
    fullName: 'Test Student',
    email: 'student@example.test',
    role: 'student',
    isActive: true,
    password: 'stored-password-hash',
  }
  let queriedEmail
  let signedPayload

  await withOverrides([
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findOne', (filter) => {
      queriedEmail = filter.email
      return { select: async () => student }
    }),
    override(bcrypt, 'compare', async () => true),
    override(jwt, 'sign', (payload, secret, options) => {
      signedPayload = { payload, secret, options }
      return 'unit-test-token'
    }),
  ], async () => {
    const response = createResponse()
    await loginStudent(loginRequest, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, {
      success: true,
      message: 'Login successful',
      token: 'unit-test-token',
      student: {
        id: 'student-id',
        fullName: 'Test Student',
        email: 'student@example.test',
        role: 'student',
      },
    })
    assert.equal(queriedEmail, 'student@example.test')
    assert.deepEqual(signedPayload, {
      payload: { id: 'student-id', email: 'student@example.test', role: 'student' },
      secret: 'unit-test-secret',
      options: { expiresIn: '1d' },
    })
  })
})

test('login rejects missing students and incorrect passwords with 401', async () => {
  await withOverrides([
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findOne', () => ({ select: async () => null })),
  ], async () => {
    const response = createResponse()
    await loginStudent(loginRequest, response)

    assert.equal(response.statusCode, 401)
    assert.equal(response.body.message, 'Invalid email or password.')
  })

  const student = {
    isActive: true,
    password: 'stored-password-hash',
  }

  await withOverrides([
    override(mongoose.connection, 'readyState', 1),
    override(Student, 'findOne', () => ({ select: async () => student })),
    override(bcrypt, 'compare', async () => false),
  ], async () => {
    const response = createResponse()
    await loginStudent(loginRequest, response)

    assert.equal(response.statusCode, 401)
    assert.equal(response.body.message, 'Invalid email or password.')
  })
})
