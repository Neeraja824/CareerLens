import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshCurrentUser } from '../src/context/authRefresh.js'

function createHarness(getCurrentUser, user = null) {
  const state = {
    user,
    token: 'existing-token',
    loading: true,
    logoutCalls: 0,
  }

  return {
    state,
    refresh: () => refreshCurrentUser({
      getCurrentUser,
      setUser: (user) => { state.user = user },
      logout: () => {
        state.logoutCalls += 1
        state.token = ''
        state.user = null
      },
      setLoading: (loading) => { state.loading = loading },
    }),
  }
}

test('/auth/me success sets the user and preserves authentication', async () => {
  const student = { id: 'student-id', fullName: 'Test Student' }
  const { state, refresh } = createHarness(async () => ({ data: { student } }))

  assert.equal(await refresh(), student)
  assert.equal(state.user, student)
  assert.equal(state.token, 'existing-token')
  assert.equal(state.logoutCalls, 0)
  assert.equal(state.loading, false)
})

test('/auth/me 401 clears authentication', async () => {
  const error = Object.assign(new Error('Unauthorized'), {
    response: { status: 401 },
  })
  const { state, refresh } = createHarness(async () => { throw error })

  assert.equal(await refresh(), null)
  assert.equal(state.user, null)
  assert.equal(state.token, '')
  assert.equal(state.logoutCalls, 1)
  assert.equal(state.loading, false)
})

test('/auth/me network failure retains token and settles loading state', async () => {
  const error = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
  const existingUser = { id: 'student-id', fullName: 'Test Student' }
  const { state, refresh } = createHarness(async () => { throw error }, existingUser)

  assert.equal(await refresh(), null)
  assert.equal(state.token, 'existing-token')
  assert.equal(state.user, existingUser)
  assert.equal(state.logoutCalls, 0)
  assert.equal(state.loading, false)
})

test('/auth/me timeout retains token and settles loading state', async () => {
  const error = Object.assign(new Error('Request timed out'), { code: 'ECONNABORTED' })
  const { state, refresh } = createHarness(async () => { throw error })

  assert.equal(await refresh(), null)
  assert.equal(state.token, 'existing-token')
  assert.equal(state.user, null)
  assert.equal(state.logoutCalls, 0)
  assert.equal(state.loading, false)
})

test('/auth/me 503 retains token and settles loading state', async () => {
  const error = Object.assign(new Error('Service unavailable'), {
    response: { status: 503 },
  })
  const { state, refresh } = createHarness(async () => { throw error })

  assert.equal(await refresh(), null)
  assert.equal(state.token, 'existing-token')
  assert.equal(state.user, null)
  assert.equal(state.logoutCalls, 0)
  assert.equal(state.loading, false)
})

test('/auth/me other 5xx responses retain token and settle loading state', async () => {
  const error = Object.assign(new Error('Internal server error'), {
    response: { status: 500 },
  })
  const { state, refresh } = createHarness(async () => { throw error })

  assert.equal(await refresh(), null)
  assert.equal(state.token, 'existing-token')
  assert.equal(state.user, null)
  assert.equal(state.logoutCalls, 0)
  assert.equal(state.loading, false)
})
