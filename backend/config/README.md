Database configuration lives in database.js. Future backend modules should remain organized by route, controller, service, model, and middleware boundary.

## Single-admin Google authentication

Configure these values only in the backend environment (for example, Render); do not expose them to the frontend:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ADMIN_SUB` — the one explicitly authorized Google OpenID Connect `sub`; email is not used for authorization.
- `GOOGLE_REDIRECT_URI` — the registered callback URL ending in `/api/admin/auth/google/callback`.
- `ADMIN_SESSION_SECRET` — a random secret of at least 32 characters, used only to sign server-side session cookies.
- `FRONTEND_URL` — the frontend origin, without a path.
- `MONGODB_URI` — used by the backend session store.

The backend runtime must be Node.js 20.8 or newer for the Mongo-backed session store.

The session cookie is HttpOnly, Secure, and SameSite=None so it can be sent between the separate Vercel and Render origins. Browser third-party-cookie restrictions may still block it. For reliable browser sessions, serve the frontend and API through a same-site custom domain or proxy. This backend phase does not establish that Google login works end-to-end.
