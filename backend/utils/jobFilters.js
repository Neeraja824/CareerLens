export const AVAILABILITY_CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function buildActiveJobFilter() {
  const now = new Date()
  return {
    isActive: true,
    availabilityConfirmedAt: {
      $gte: new Date(now.getTime() - AVAILABILITY_CONFIRMATION_MAX_AGE_MS),
      $lte: now,
    },
    $or: [
      { expiryDate: null },
      { expiryDate: { $gte: now } },
    ],
  }
}

export function buildVerifiedActiveJobFilter() {
  const now = new Date()

  return {
    ...buildActiveJobFilter(),
    verifiedAt: { $ne: null },
    verifiedBy: { $in: ['college_placement_office', 'employer'] },
    sourceProvider: { $in: ['greenhouse', 'lever'] },
    sourceCompany: { $type: 'string', $ne: '' },
    sourceListingId: { $type: 'string', $ne: '' },
    sourceCareersUrl: /^https:\/\//i,
    sourceUrl: /^https:\/\/(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co)\//i,
    externalApplicationUrl: /^https:\/\/(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co)\//i,
    lastCheckedAt: {
      $gte: new Date(now.getTime() - AVAILABILITY_CONFIRMATION_MAX_AGE_MS),
      $lte: now,
    },
  }
}
