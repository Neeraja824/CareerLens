import test from 'node:test'
import assert from 'node:assert/strict'

import { isSupportedResumeType } from '../controllers/resumeController.js'
import { validateRegistrationInput, validateLoginInput } from '../utils/authValidation.js'

test('registration validation rejects invalid email and weak password', () => {
  const result = validateRegistrationInput({
    fullName: 'Test Student',
    studentId: 'TEST001',
    email: 'invalid-email',
    phone: '123',
    password: '123',
    department: 'Information Technology',
    branch: 'IT',
    graduationYear: '2027',
  })

  assert.equal(result.isValid, false)
  assert.ok(result.errors.email)
  assert.ok(result.errors.phone)
  assert.ok(result.errors.password)
})

test('login validation requires email and password', () => {
  const result = validateLoginInput({ email: '', password: '' })

  assert.equal(result.isValid, false)
  assert.ok(result.errors.email)
  assert.ok(result.errors.password)
})

test('resume uploads accept pdf and doc formats', () => {
  assert.equal(isSupportedResumeType('application/pdf'), true)
  assert.equal(isSupportedResumeType('application/msword'), true)
  assert.equal(isSupportedResumeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true)
  assert.equal(isSupportedResumeType('application/octet-stream'), false)
})
