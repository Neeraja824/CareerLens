import test from 'node:test'
import assert from 'node:assert/strict'
import { verificationDetails } from '../src/utils/jobVerification.js'

test('source-page review is not labeled as employer or placement-office verification', () => {
  const details = verificationDetails({
    sourceReviewStatus: 'approved',
    sourceReviewAt: '2026-10-22T04:00:00.000Z',
    sourceReviewBy: 'Placement staff',
    sourceReviewAvailability: 'available',
    verifiedAt: null,
    verifiedBy: undefined,
  })

  assert.match(details.label, /Careers and application pages reviewed: approved/)
  assert.match(details.label, /marked available/)
  assert.doesNotMatch(details.label, /employer|college placement office|verified/i)
  assert.equal(details.type, 'reviewed')
})

test('feed-only records continue to identify the feed check without verification claims', () => {
  const details = verificationDetails({
    sourceProvider: 'greenhouse',
    sourceCompany: 'Netlify',
    lastCheckedAt: '2026-10-22T04:00:00.000Z',
  })

  assert.match(details.label, /Official Greenhouse feed · checked/)
  assert.doesNotMatch(details.label, /verified|approved/i)
  assert.equal(details.type, 'official')
})
