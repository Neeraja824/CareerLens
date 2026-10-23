const CALLBACK_PATH = '/api/admin/auth/google/callback'

function isSecureOrigin(value, env) {
  try {
    const url = new URL(value)
    const localDevelopment = env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && url.protocol === 'http:'

    return (url.protocol === 'https:' || localDevelopment)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

function parseOrigin(value, env) {
  if (!isSecureOrigin(value, env)) return null

  const url = new URL(value)
  if (url.pathname !== '/') return null
  return url.origin
}

export function loadAdminAuthConfig(env = process.env) {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_ADMIN_SUB',
    'GOOGLE_REDIRECT_URI',
    'ADMIN_SESSION_SECRET',
    'FRONTEND_URL',
    'MONGODB_URI',
  ]
  const missing = required.filter((name) => (
    typeof env[name] !== 'string' || env[name].trim() === ''
  ))

  if (missing.length) {
    throw new Error(
      `Google admin authentication is not configured. Missing required environment variable(s): ${missing.join(', ')}.`,
    )
  }

  const frontendOrigin = parseOrigin(env.FRONTEND_URL, env)
  if (!frontendOrigin) {
    throw new Error('Invalid admin authentication configuration: FRONTEND_URL must be a secure origin.')
  }

  if (env.ADMIN_SESSION_SECRET.length < 32) {
    throw new Error('Invalid admin authentication configuration: ADMIN_SESSION_SECRET must be at least 32 characters.')
  }

  if (!/^mongodb(?:\+srv)?:\/\//i.test(env.MONGODB_URI)) {
    throw new Error('Invalid admin authentication configuration: MONGODB_URI must be a MongoDB connection URI.')
  }

  let redirectUri
  try {
    redirectUri = new URL(env.GOOGLE_REDIRECT_URI)
  } catch {
    throw new Error('Invalid admin authentication configuration: GOOGLE_REDIRECT_URI is invalid.')
  }

  const localDevelopment = env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(redirectUri.hostname)
    && redirectUri.protocol === 'http:'
  if (
    (redirectUri.protocol !== 'https:' && !localDevelopment)
    || redirectUri.pathname !== CALLBACK_PATH
    || redirectUri.username
    || redirectUri.password
    || redirectUri.search
    || redirectUri.hash
  ) {
    throw new Error(
      `Invalid admin authentication configuration: GOOGLE_REDIRECT_URI must be a secure URL ending in ${CALLBACK_PATH}.`,
    )
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    ownerSubject: env.GOOGLE_ADMIN_SUB,
    redirectUri,
    frontendOrigin,
    sessionSecret: env.ADMIN_SESSION_SECRET,
    mongoUri: env.MONGODB_URI,
  }
}
