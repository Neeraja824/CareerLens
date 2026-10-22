import Job from '../models/job.model.js'
import { NETLIFY_ALLOWED_LISTING_IDS } from '../utils/netlifyJobPolicy.js'

const sourceIdentity = {
  sourceProvider: 'greenhouse',
  sourceCompany: 'Netlify',
  sourceCareersUrl: 'https://www.netlify.com/careers/',
}

export async function reviewNetlifyListing(
  request,
  response,
  { JobModel = Job, now = () => new Date() } = {},
) {
  const { sourceListingId } = request.params
  if (!NETLIFY_ALLOWED_LISTING_IDS.includes(sourceListingId)) {
    return response.status(404).json({
      success: false,
      message: 'Netlify job listing not found.',
    })
  }

  const body = request.body
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).length !== 3
    || Object.keys(body).some((key) => !['decision', 'availability', 'publish'].includes(key))
    || !['approved', 'rejected'].includes(body.decision)
    || !['available', 'unavailable'].includes(body.availability)
    || typeof body.publish !== 'boolean'
  ) {
    return response.status(400).json({
      success: false,
      message: 'Provide decision, availability, and publish with valid values.',
    })
  }

  if (
    (body.decision === 'approved' && body.availability !== 'available')
    || (body.publish && (body.decision !== 'approved' || body.availability !== 'available'))
  ) {
    return response.status(400).json({
      success: false,
      message: 'Publishing requires an approved listing confirmed available.',
    })
  }

  if (typeof request.jobReviewer !== 'string' || !request.jobReviewer.trim()) {
    return response.status(503).json({
      success: false,
      message: 'Job review authorization is not configured.',
    })
  }

  const reviewedAt = now()
  const update = {
    $set: {
      sourceReviewStatus: body.decision,
      sourceReviewAt: reviewedAt,
      sourceReviewBy: request.jobReviewer.trim(),
      sourceReviewAvailability: body.availability,
      availabilityConfirmedAt: body.availability === 'available' ? reviewedAt : null,
      lastCheckedAt: reviewedAt,
      isActive: body.publish,
    },
  }

  try {
    const job = await JobModel.findOneAndUpdate(
      {
        ...sourceIdentity,
        sourceListingId,
        sourceUrl: new RegExp(
          `^https://(?:boards|job-boards)\\.greenhouse\\.io/netlify/jobs/${sourceListingId}/?$`,
          'i',
        ),
        externalApplicationUrl: new RegExp(
          `^https://(?:boards|job-boards)\\.greenhouse\\.io/netlify/jobs/${sourceListingId}/?$`,
          'i',
        ),
      },
      update,
      { new: true, runValidators: true },
    ).select('_id title sourceReviewStatus sourceReviewAt sourceReviewBy sourceReviewAvailability availabilityConfirmedAt isActive')

    if (!job) {
      return response.status(404).json({
        success: false,
        message: 'Netlify job listing not found.',
      })
    }

    return response.status(200).json({
      success: true,
      job,
    })
  } catch (error) {
    console.error('Netlify job review error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to record the Netlify job review.',
    })
  }
}
