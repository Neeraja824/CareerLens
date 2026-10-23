import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadAdminAuthConfig,
} from '../config/adminAuth.js'
import {
  createAdminAuthHandlers,
} from '../controllers/adminAuthController.js'
import {
  adminSessionCookieOptions,
  requireAdminCsrf,
  requireAdminSession,
  requireExactAdminOrigin,
} from '../middleware/adminAuthMiddleware.js'

const validEnvironment = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_ADMIN_SUB: 'google-owner-sub',
  GOOGLE_REDIRECT_URI: 'https://backend.example.test/api/admin/auth/google/callback',
  ADMIN_SESSION_SECRET: 'a'.repeat(32),
  FRONTEND_URL: 'https://frontend.example.test',
  MONGODB_URI: 'mongodb://localhost/careerlens-test',
  NODE_ENV: 'production',
}

function validConfig() {
  return loadAdminAuthConfig(validEnvironment)
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    redirected: undefined,
    clearedCookie: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    redirect(statusCode, location) {
      this.statusCode = statusCode
      this.redirected = location
      return this
    },
    clearCookie(name, options) {
      this.clearedCookie = { name, options }
      return this
    },
  }
}

function createSession(pendingGoogleAuth) {
  return {
    pendingGoogleAuth,
    cookie: {},
    regenerated: false,
    destroyed: false,
    saved: false,
    regenerate(callback) {
      this.regenerated = true
      callback()
    },
    save(callback) {
      this.saved = true
      callback()
    },
    destroy(callback) {
      this.destroyed = true
      callback()
    },
  }
}

function createRequest(session, originalUrl = '') {
  return {
    session,
    originalUrl,
    get(name) {
      if (name.toLowerCase() === 'origin') return 'https://frontend.example.test'
      return undefined
    },
  }
}

function createOidcClient(overrides = {}) {
  return {
    randomPKCECodeVerifier: () => 'verifier-value',
    calculatePKCECodeChallenge: async () => 'challenge-value',
    randomState: () => 'random-state',
    randomNonce: () => 'random-nonce',
    buildAuthorizationUrl: (_configuration, parameters) => {
      const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      Object.entries(parameters).forEach(([key, value]) => authorizationUrl.searchParams.set(key, value))
      return authorizationUrl
    },
    authorizationCodeGrant: async () => ({ claims: () => ({ sub: 'google-owner-sub' }) }),
    ...overrides,
  }
}

test('admin authentication configuration fails closed when required variables are missing', () => {
  assert.throws(
    () => loadAdminAuthConfig({}),
    (error) => {
      assert.match(error.message, /GOOGLE_CLIENT_ID/)
      assert.match(error.message, /GOOGLE_ADMIN_SUB/)
      assert.doesNotMatch(error.message, /client-secret|google-owner-sub/)
      return true
    },
  )
})

test('admin authentication requires an exact secure callback and an explicit owner subject', () => {
  assert.throws(
    () => loadAdminAuthConfig({
      ...validEnvironment,
      GOOGLE_ADMIN_SUB: '',
    }),
    /GOOGLE_ADMIN_SUB/,
  )
  assert.throws(
    () => loadAdminAuthConfig({
      ...validEnvironment,
      GOOGLE_REDIRECT_URI: 'https://attacker.example.test/callback',
    }),
    /GOOGLE_REDIRECT_URI/,
  )
  assert.throws(
    () => loadAdminAuthConfig({
      ...validEnvironment,
      ADMIN_SESSION_SECRET: 'too-short',
    }),
    /ADMIN_SESSION_SECRET/,
  )
})

test('Google sign-in creates unpredictable state, nonce, and PKCE parameters before redirecting', async () => {
  const session = createSession()
  let authorizationParameters
  const client = createOidcClient({
    buildAuthorizationUrl: (_configuration, parameters) => {
      authorizationParameters = parameters
      return new URL('https://accounts.google.com/authorize')
    },
  })
  const handlers = createAdminAuthHandlers(validConfig(), {
    client,
    getProviderConfiguration: async () => ({}),
  })
  const response = createResponse()

  await handlers.startGoogleSignIn(createRequest(session), response)

  assert.equal(response.statusCode, 302)
  assert.equal(response.redirected, 'https://accounts.google.com/authorize')
  assert.equal(session.pendingGoogleAuth.state, 'random-state')
  assert.equal(session.pendingGoogleAuth.nonce, 'random-nonce')
  assert.equal(session.pendingGoogleAuth.codeVerifier, 'verifier-value')
  assert.deepEqual(
    {
      state: authorizationParameters.state,
      nonce: authorizationParameters.nonce,
      code_challenge: authorizationParameters.code_challenge,
      code_challenge_method: authorizationParameters.code_challenge_method,
    },
    {
      state: 'random-state',
      nonce: 'random-nonce',
      code_challenge: 'challenge-value',
      code_challenge_method: 'S256',
    },
  )
  assert.equal(session.saved, true)
})

test('callback rejects missing or mismatched state without exchanging an authorization code', async () => {
  let grantCalled = false
  const handlers = createAdminAuthHandlers(validConfig(), {
    client: createOidcClient({
      authorizationCodeGrant: async () => {
        grantCalled = true
        return { claims: () => ({ sub: 'google-owner-sub' }) }
      },
    }),
    getProviderConfiguration: async () => ({}),
  })
  const pending = {
    state: 'expected-state',
    nonce: 'expected-nonce',
    codeVerifier: 'expected-verifier',
    expiresAt: Date.now() + 60_000,
  }

  for (const originalUrl of [
    '/api/admin/auth/google/callback?code=authorization-code',
    '/api/admin/auth/google/callback?code=authorization-code&state=wrong-state',
    '/api/admin/auth/google/callback?state=expected-state&state=duplicate-state',
    '/unsafe/callback?code=authorization-code&state=expected-state',
  ]) {
    const session = createSession({ ...pending })
    const response = createResponse()
    await handlers.completeGoogleSignIn(createRequest(session, originalUrl), response)
    assert.equal(response.statusCode, 401)
    assert.equal(session.destroyed, true)
  }

  assert.equal(grantCalled, false)
})

test('callback sends expected nonce and PKCE verifier to OIDC validation and fails safely on mismatch', async () => {
  let grantOptions
  const handlers = createAdminAuthHandlers(validConfig(), {
    client: createOidcClient({
      authorizationCodeGrant: async (_configuration, _url, options) => {
        grantOptions = options
        throw new Error('sensitive provider response')
      },
    }),
    getProviderConfiguration: async () => ({}),
  })
  const session = createSession({
    state: 'expected-state',
    nonce: 'expected-nonce',
    codeVerifier: 'expected-verifier',
    expiresAt: Date.now() + 60_000,
  })
  const response = createResponse()

  await handlers.completeGoogleSignIn(
    createRequest(session, '/api/admin/auth/google/callback?code=authorization-code&state=expected-state'),
    response,
  )

  assert.deepEqual(grantOptions, {
    pkceCodeVerifier: 'expected-verifier',
    expectedState: 'expected-state',
    expectedNonce: 'expected-nonce',
    idTokenExpected: true,
  })
  assert.equal(response.statusCode, 401)
  assert.doesNotMatch(JSON.stringify(response.body), /sensitive provider response|expected-nonce/)
  assert.equal(session.destroyed, true)
})

test('callback rejects any Google subject except the configured owner and does not create a session', async () => {
  const handlers = createAdminAuthHandlers(validConfig(), {
    client: createOidcClient({
      authorizationCodeGrant: async () => ({ claims: () => ({ sub: 'another-google-sub' }) }),
    }),
    getProviderConfiguration: async () => ({}),
  })
  const session = createSession({
    state: 'expected-state',
    nonce: 'expected-nonce',
    codeVerifier: 'expected-verifier',
    expiresAt: Date.now() + 60_000,
  })
  const response = createResponse()

  await handlers.completeGoogleSignIn(
    createRequest(session, '/api/admin/auth/google/callback?code=authorization-code&state=expected-state'),
    response,
  )

  assert.equal(response.statusCode, 403)
  assert.deepEqual(response.body, {
    success: false,
    message: 'This Google account is not authorized.',
  })
  assert.equal(session.destroyed, true)
  assert.equal(response.redirected, undefined)
})

test('admin session cookies are HttpOnly, Secure, and scoped to the host root', () => {
  assert.deepEqual(adminSessionCookieOptions(60_000), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60_000,
  })
})

test('provider discovery failures return a safe service error', async () => {
  const handlers = createAdminAuthHandlers(validConfig(), {
    client: createOidcClient(),
    getProviderConfiguration: async () => { throw new Error('sensitive discovery details') },
  })
  const response = createResponse()

  await handlers.startGoogleSignIn(createRequest(createSession()), response)

  assert.equal(response.statusCode, 503)
  assert.doesNotMatch(JSON.stringify(response.body), /sensitive discovery details|client-secret/)
})

test('session and CSRF middleware require the exact frontend origin and valid admin session', () => {
  const config = validConfig()
  const response = createResponse()
  let nextCalled = false
  const originGuard = requireExactAdminOrigin(config.frontendOrigin)

  originGuard(
    { get: () => 'https://frontend.example.test.evil.invalid' },
    response,
    () => { nextCalled = true },
  )
  assert.equal(response.statusCode, 403)
  assert.equal(nextCalled, false)

  const sessionResponse = createResponse()
  const sessionGuard = requireAdminSession(config, { now: () => 1000 })
  sessionGuard(
    { session: { adminSubject: 'someone-else', adminExpiresAt: 2000 } },
    sessionResponse,
    () => assert.fail('unauthorized subject must not continue'),
  )
  assert.equal(sessionResponse.statusCode, 401)

  const csrfResponse = createResponse()
  requireAdminCsrf(
    {
      session: { csrfToken: 'expected-csrf' },
      get: () => 'wrong-csrf',
    },
    csrfResponse,
    () => assert.fail('invalid CSRF token must not continue'),
  )
  assert.equal(csrfResponse.statusCode, 403)
})
