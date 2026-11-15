import assert from 'node:assert/strict'

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
async function api(path, { method = 'GET', body, token, clientId = 'stage2-ci' } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: token } : {}),
      'client-id': clientId
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  assert.equal(response.status, 200, `${method} ${path} HTTP status`)
  return response.json()
}

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: process.env.BOOTSTRAP_ADMIN_PASSWORD } })
assert.equal(login.code, 200, `login failed: ${login.message}`)
assert.ok(login.data?.token)
const token = login.data.token

const me = await api('/api/me', { token })
assert.equal(me.code, 200, `current user failed: ${me.message}`)
assert.equal(me.data.username, 'admin')
assert.ok(me.data.role_names.includes('admin'))

const users = await api('/api/admin/user/list', { token })
assert.equal(users.code, 200, `admin user list failed: ${users.message}`)
assert.ok(users.data.total >= 1)

const roles = await api('/api/admin/role/list', { token })
assert.equal(roles.code, 200, `admin role list failed: ${roles.message}`)
assert.ok(roles.data.content.some(role => role.name === 'admin'))

const settings = await api('/api/public/settings')
assert.equal(settings.code, 200)
assert.equal(settings.data.allow_register, 'true')
assert.equal(Object.hasOwn(settings.data, 'token'), false)

const registered = await api('/api/auth/register', { method: 'POST', body: { username: 'stage2-smoke-user', password: 'stage2-smoke-password' } })
assert.equal(registered.code, 200, `registration failed: ${registered.message}`)
const userLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'stage2-smoke-user', password: 'stage2-smoke-password' }, clientId: 'stage2-user' })
assert.equal(userLogin.code, 200, `registered user login failed: ${userLogin.message}`)
const userMe = await api('/api/me', { token: userLogin.data.token, clientId: 'stage2-user' })
assert.equal(userMe.code, 200)
assert.equal(userMe.data.username, 'stage2-smoke-user')

const logout = await api('/api/auth/logout', { token: userLogin.data.token, clientId: 'stage2-user' })
assert.equal(logout.code, 200)
const revoked = await api('/api/me', { token: userLogin.data.token, clientId: 'stage2-user' })
assert.equal(revoked.code, 401)

process.stdout.write('Stage 2 auth integration passed: login, JWT, current user, roles, admin APIs, public settings, registration, logout/revocation.\n')
