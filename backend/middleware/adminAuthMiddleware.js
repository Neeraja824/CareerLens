import { timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE_NAME = '__Host-careerlens-admin'

export function requireExactAdminOrigin(frontendOrigin) {
  return (request, response, next) => {
    if (request.get('origin') !== frontendOrigin) {
      return response.status(403).json({
        success: false,
        message: 'Request origin is not allowed.',
      })
    }

    return next()
  }
}

export function requireAdminSession(config, { now = Date.now } = {}) {
  return (request, response, next) => {
    const session = request.session
    const expiresAt = Number(session?.adminExpiresAt)
    if (
      session?.adminSubject !== config.ownerSubject
      || !Number.isFinite(expiresAt)
      || expiresAt <= now()
    ) {
      return response.status(401).json({
        success: false,
        message: 'Admin authentication required.',
      })
    }

    request.admin = { subject: session.adminSubject }
    return next()
  }
}

export function requireAdminCsrf(request, response, next) {
  const expected = request.session?.csrfToken
  const supplied = request.get('x-csrf-token')
  if (typeof expected !== 'string' || typeof supplied !== 'string') {
    return response.status(403).json({
      success: false,
      message: 'CSRF validation failed.',
    })
  }

  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  if (
    expectedBuffer.length !== suppliedBuffer.length
    || !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return response.status(403).json({
      success: false,
      message: 'CSRF validation failed.',
    })
  }

  return next()
}

export function adminSessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge,
  }
}

export function clearAdminSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  })
}

export { SESSION_COOKIE_NAME }
