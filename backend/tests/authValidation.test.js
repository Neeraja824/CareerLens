import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  analyzeResumeWithAi,
  buildSectionPayload,
  getAnalysisFailureMessage,
  isSupportedResumeType,
} from '../controllers/resumeController.js'
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

test('legacy section values matching the full resume are returned as empty', () => {
  const extractedText = 'Candidate Name\nEducation\nBSc Computer Science\nProjects\nExample App'

  assert.deepEqual(buildSectionPayload([extractedText], extractedText), [])
  assert.deepEqual(
    buildSectionPayload(['BSc Computer Science', 'Example College'], extractedText),
    ['BSc Computer Science', 'Example College'],
  )
})

test('AI service connection failures are not reported as DOCX parsing errors', () => {
  const error = Object.assign(new Error('AI service request failed (ECONNREFUSED).'), {
    code: 'AI_SERVICE_CONNECTION',
  })

  const message = getAnalysisFailureMessage(error, 'docx')

  assert.match(message, /AI analysis service could not be reached/i)
  assert.doesNotMatch(message, /DOCX file could not be read/i)
})

test('DOCX extraction failures receive a safe DOCX-specific message', () => {
  const error = Object.assign(new Error('AI service returned HTTP 400: private upstream detail'), {
    code: 'AI_SERVICE_RESPONSE',
    statusCode: 400,
  })

  const message = getAnalysisFailureMessage(error, 'docx')

  assert.match(message, /DOCX file could not be read/i)
  assert.doesNotMatch(message, /private upstream detail/i)
})

test('DOCX AI request connection failures stay distinct from extraction failures', async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'careerlens-resume-'))
  const storagePath = path.join(temporaryDirectory, 'resume.docx')
  fs.writeFileSync(storagePath, 'synthetic docx bytes')

  try {
    await assert.rejects(
      analyzeResumeWithAi(
        {
          storagePath,
          fileType: 'docx',
          originalFileName: 'resume.docx',
        },
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        async (url, options) => {
          assert.match(url, /\/analyze-resume$/)
          assert.equal(options.method, 'POST')
          const uploadedFile = options.body.get('resume')
          assert.equal(uploadedFile.name, 'resume.docx')
          assert.equal(uploadedFile.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
        },
      ),
      (error) => {
        assert.equal(error.code, 'AI_SERVICE_CONNECTION')
        const message = getAnalysisFailureMessage(error, 'docx')
        assert.match(message, /AI analysis service could not be reached/i)
        assert.doesNotMatch(message, /DOCX file could not be read/i)
        return true
      },
    )
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})
