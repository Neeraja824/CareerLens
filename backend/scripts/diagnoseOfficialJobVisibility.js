import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import Job from '../models/job.model.js'
import { buildVerifiedActiveJobFilter } from '../utils/jobFilters.js'

function countPipeline(filter) {
  return [
    { $match: filter },
    { $count: 'count' },
  ]
}

export async function runJobVisibilityDiagnostic({
  output = console,
  connect = connectDatabase,
  disconnect = () => mongoose.disconnect(),
  JobModel = Job,
} = {}) {
  let connected = false

  try {
    connected = await connect()
    if (!connected) return false

    const verifiedFilter = buildVerifiedActiveJobFilter()
    const genericVerification = verifiedFilter.$and[0].$or[0]
    const reviewException = verifiedFilter.$and[0].$or[1]
    const criteria = {
      activeStatus: { isActive: verifiedFilter.isActive },
      availabilityConfirmationFresh: {
        availabilityConfirmedAt: verifiedFilter.availabilityConfirmedAt,
      },
      notExpired: { $or: verifiedFilter.$or },
      providerAllowed: { sourceProvider: verifiedFilter.sourceProvider },
      sourceCompanyNonEmptyString: { sourceCompany: verifiedFilter.sourceCompany },
      sourceListingIdNonEmptyString: { sourceListingId: verifiedFilter.sourceListingId },
      sourceCareersUrlOfficialHttps: { sourceCareersUrl: verifiedFilter.sourceCareersUrl },
      sourceUrlOfficialHttps: { sourceUrl: verifiedFilter.sourceUrl },
      externalApplicationUrlOfficialHttps: {
        externalApplicationUrl: verifiedFilter.externalApplicationUrl,
      },
      lastCheckedAtFresh: { lastCheckedAt: verifiedFilter.lastCheckedAt },
      outsideGreenhouseNetlifyReviewException: genericVerification.$and[0],
      verifiedAtPresent: { verifiedAt: genericVerification.$and[1].verifiedAt },
      verifiedByAllowed: { verifiedBy: genericVerification.$and[1].verifiedBy },
      netlifyReviewProvider: { sourceProvider: reviewException.sourceProvider },
      netlifyReviewCompany: { sourceCompany: reviewException.sourceCompany },
      netlifyReviewListingIdAllowed: { sourceListingId: reviewException.sourceListingId },
      netlifyReviewApproved: { sourceReviewStatus: reviewException.sourceReviewStatus },
      netlifyReviewAtPresent: { sourceReviewAt: reviewException.sourceReviewAt },
      netlifyReviewByNonEmptyString: { sourceReviewBy: reviewException.sourceReviewBy },
      netlifyReviewAvailabilityAvailable: {
        sourceReviewAvailability: reviewException.sourceReviewAvailability,
      },
      genericVerificationAccepted: genericVerification,
      netlifyReviewExceptionAccepted: reviewException,
      providerVerificationOrReviewAccepted: verifiedFilter.$and[0],
    }

    const facets = {
      total: [{ $count: 'count' }],
      matchingFullVisibilityFilter: countPipeline(verifiedFilter),
    }
    for (const [name, criterion] of Object.entries(criteria)) {
      facets[name] = countPipeline(criterion)
    }

    const [result] = await JobModel.aggregate([{ $facet: facets }])
    const countFor = (name) => result[name][0]?.count ?? 0
    const totalRecords = countFor('total')
    const overlappingDiagnosticCounts = Object.fromEntries(
      Object.keys(criteria).map((name) => {
        const passing = countFor(name)
        return [name, { passing, failing: totalRecords - passing }]
      }),
    )

    output.log(JSON.stringify({
      totalRecords,
      matchingFullVisibilityFilter: countFor('matchingFullVisibilityFilter'),
      overlappingDiagnosticCounts,
    }, null, 2))
    return true
  } catch {
    output.error('Job visibility diagnostic failed. Check authorized database connectivity and read permissions.')
    return false
  } finally {
    if (connected || mongoose.connection.readyState !== 0) {
      await disconnect()
    }
  }
}

async function main() {
  const success = await runJobVisibilityDiagnostic()
  if (!success) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
