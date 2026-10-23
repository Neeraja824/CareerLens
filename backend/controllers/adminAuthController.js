import { randomBytes, timingSafeEqual } from 'node:crypto'
import * as oidcClient from 'openid-client'
import { clearAdminSessionCookie } from '../middleware/adminAuthMiddleware.js'

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000

function callSessionMethod(session, method) {
  return new Promise((resolve, reject) => {
    session[method]((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function stateMatches(expected, supplied) {
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false

  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

function destroySession(request) {
  if (!request.session) return Promise.resolve()
  return callSessionMethod(request.session, 'destroy')
}

async function invalidateSession(request, response) {
  try {
    await destroySession(request)
    clearAdminSessionCookie(response)
    return true
  } catch {
    clearAdminSessionCookie(response)
    response.status(503).json({
      success: false,
      message: 'Admin session could not be invalidated.',
    })
    return false
  }
}

function callbackUrlFor(request, redirectUri) {
  const requestUrl = new URL(request.originalUrl, redirectUri)
  if (requestUrl.pathname !== redirectUri.pathname) {
    throw new Error('Invalid OAuth callback path.')
  }

  const callbackUrl = new URL(redirectUri)
  callbackUrl.search = requestUrl.search
  return callbackUrl
}

function createProviderConfigurationLoader(config, client) {
  let pendingConfiguration
  return () => {
    if (!pendingConfiguration) {
      pendingConfiguration = client.discovery(
        new URL('https://accounts.google.com'),
        config.clientId,
        config.clientSecret,
      ).catch((error) => {
        pendingConfiguration = undefined
        throw error
      })
    }
    return pendingConfiguration
  }
}

export function createAdminAuthHandlers(
  config,
  { client = oidcClient, getProviderConfiguration, now = Date.now } = {},
) {
  const loadProviderConfiguration = getProviderConfiguration
    || createProviderConfigurationLoader(config, client)

  async function startGoogleSignIn(request, response) {
    const origin = request.get('origin')
    if (origin && origin !== config.frontendOrigin) {
      return response.status(403).json({
        success: false,
        message: 'Request origin is not allowed.',
      })
    }

    let sessionRegenerated = false
    try {
      const providerConfiguration = await loadProviderConfiguration()
      const codeVerifier = client.randomPKCECodeVerifier()
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
      const state = client.randomState()
      const nonce = client.randomNonce()
      const authorizationUrl = client.buildAuthorizationUrl(providerConfiguration, {
        redirect_uri: config.redirectUri.href,
        response_type: 'code',
        scope: 'openid email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })

      await callSessionMethod(request.session, 'regenerate')
      sessionRegenerated = true
      request.session.pendingGoogleAuth = {
        state,
        nonce,
        codeVerifier,
        expiresAt: now() + OAUTH_STATE_LIFETIME_MS,
      }
      request.session.cookie.maxAge = OAUTH_STATE_LIFETIME_MS
      await callSessionMethod(request.session, 'save')

      return response.redirect(302, authorizationUrl.href)
    } catch {
      if (sessionRegenerated && !await invalidateSession(request, response)) return
      return response.status(503).json({
        success: false,
        message: 'Google sign-in is temporarily unavailable.',
      })
    }
  }

  async function completeGoogleSignIn(request, response) {
    const pending = request.session?.pendingGoogleAuth
    const query = new URLSearchParams(request.originalUrl.split('?')[1] || '')
    const stateValues = query.getAll('state')
    if (!pending) {
      return response.status(401).json({
        success: false,
        message: 'Google sign-in could not be validated.',
      })
    }

    if (
      !Number.isFinite(pending.expiresAt)
      || pending.expiresAt <= now()
      || stateValues.length !== 1
      || !stateMatches(pending.state, stateValues[0])
    ) {
      if (!await invalidateSession(request, response)) return
      return response.status(401).json({
        success: false,
        message: 'Google sign-in could not be validated.',
      })
    }

    try {
      const providerConfiguration = await loadProviderConfiguration()
      const tokens = await client.authorizationCodeGrant(
        providerConfiguration,
        callbackUrlFor(request, config.redirectUri),
        {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        },
      )
      const claims = tokens.claims()
      if (!claims || typeof claims.sub !== 'string' || claims.sub !== config.ownerSubject) {
        if (!await invalidateSession(request, response)) return
        return response.status(403).json({
          success: false,
          message: 'This Google account is not authorized.',
        })
      }

      await callSessionMethod(request.session, 'regenerate')
      request.session.adminSubject = claims.sub
      request.session.adminExpiresAt = now() + SESSION_LIFETIME_MS
      request.session.csrfToken = randomBytes(32).toString('base64url')
      request.session.cookie.maxAge = SESSION_LIFETIME_MS
      await callSessionMethod(request.session, 'save')

      return response.redirect(303, `${config.frontendOrigin}/`)
    } catch {
      if (!await invalidateSession(request, response)) return
      return response.status(401).json({
        success: false,
        message: 'Google sign-in could not be completed.',
      })
    }
  }

  async function getAdminSession(request, response) {
    return response.json({
      success: true,
      authenticated: true,
      csrfToken: request.session.csrfToken,
    })
  }

  async function logoutAdmin(request, response) {
    if (!await invalidateSession(request, response)) return
    return response.status(200).json({ success: true })
  }

  return {
    startGoogleSignIn,
    completeGoogleSignIn,
    getAdminSession,
    logoutAdmin,
  }
}

export const adminSessionLifetimeMs = SESSION_LIFETIME_MS
