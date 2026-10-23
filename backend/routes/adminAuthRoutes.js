import express from 'express'
import MongoStore from 'connect-mongo'
import session from 'express-session'
import { loadAdminAuthConfig } from '../config/adminAuth.js'
import { createAdminAuthHandlers } from '../controllers/adminAuthController.js'
import {
  adminSessionCookieOptions,
  requireAdminCsrf,
  requireAdminSession,
  requireExactAdminOrigin,
  SESSION_COOKIE_NAME,
} from '../middleware/adminAuthMiddleware.js'

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000
const router = express.Router()

let config
try {
  config = loadAdminAuthConfig()
} catch (error) {
  router.use((_request, response) => response.status(503).json({
    success: false,
    message: error.message,
  }))
}

if (config) {
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    response.set('Referrer-Policy', 'no-referrer')
    next()
  })

  const store = MongoStore.create({
    mongoUrl: config.mongoUri,
    collectionName: 'adminSessions',
    ttl: SESSION_LIFETIME_MS / 1000,
  })

  router.use(session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    proxy: true,
    cookie: adminSessionCookieOptions(SESSION_LIFETIME_MS),
  }))

  const handlers = createAdminAuthHandlers(config)
  const requireOrigin = requireExactAdminOrigin(config.frontendOrigin)
  const requireSession = requireAdminSession(config)

  router.get('/google', handlers.startGoogleSignIn)
  router.get('/google/callback', handlers.completeGoogleSignIn)
  router.get('/session', requireOrigin, requireSession, handlers.getAdminSession)
  router.post(
    '/logout',
    requireOrigin,
    requireSession,
    requireAdminCsrf,
    handlers.logoutAdmin,
  )
}

router.use((error, _request, response, _next) => {
  console.error('Admin authentication session storage failed.')
  response.status(503).json({
    success: false,
    message: 'Admin authentication is temporarily unavailable.',
  })
})

export default router
