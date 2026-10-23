import { timingSafeEqual } from 'node:crypto'

function configuredReviewer(env) {
  return typeof env.JOB_REVIEW_API_REVIEWER === 'string'
    ? env.JOB_REVIEW_API_REVIEWER.trim()
    : ''
}

export function jobReviewAuthMiddleware(
  request,
  response,
  next,
  { env = process.env } = {},
) {
  const expectedToken = typeof env.JOB_REVIEW_API_TOKEN === 'string'
    ? env.JOB_REVIEW_API_TOKEN
    : ''
  const reviewer = configuredReviewer(env)

  if (!expectedToken || expectedToken.length > 512 || !reviewer || reviewer.length > 160) {
    return response.status(503).json({
      success: false,
      message: 'Job review authorization is not configured.',
    })
  }

  const authorization = request.headers.authorization
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/)
    : null

  if (!match) {
    return response.status(401).json({
      success: false,
      message: 'Job review authorization required.',
    })
  }

  const suppliedToken = Buffer.from(match[1])
  const configuredToken = Buffer.from(expectedToken)

  if (
    suppliedToken.length !== configuredToken.length
    || !timingSafeEqual(suppliedToken, configuredToken)
  ) {
    return response.status(401).json({
      success: false,
      message: 'Invalid job review authorization.',
    })
  }

  request.jobReviewer = reviewer
  return next()
}