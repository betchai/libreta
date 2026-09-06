// libreta multi-tenancy integration tests.
//
// Runs against the LIVE Supabase instance (uses .env/.env.deploy for creds).
// Creates isolated test tenants + users (ITEST-*), exercises membership,
// switching, RLS isolation, roles and privilege hardening AS REAL USERS, then
// cleans everything up. Each assertion measures correctness through the exact
// REST + RLS surface the app uses.
//
// Run: node tests/multitenancy.mjs
import { readFileSync } from 'node:fs'

const readEnv = (f) => {
  const out = {}
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (line.startsWith('#') || eq < 1) continue
    out[line.slice(0, eq)] = line.slice(eq + 1).trim()
  }
  return out
}
const deploy = readEnv('.env.deploy')
const local = readEnv('.env')
const URL = deploy.SUPABASE_URL
const SRV = deploy.SUPABASE_SERVICE_ROLE_KEY
const ANON = local.VITE_SUPABASE_ANON_KEY
if (!URL || !SRV || !ANON) throw new Error('Missing env: .env.deploy (SUPABASE_*) or .env (VITE_SUPABASE_ANON_KEY)')

const j = (headers) => ({ ...headers, 'Content-Type': 'application/json' })

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(`${URL}${path}`, {
    method,
    headers: body ? j(headers) : headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : null
  if (!r.ok) {
    const err = new Error(data?.message || data?.error?.message || `${r.status}: ${text.slice(0, 200)}`)
    err.code = data?.code || r.status
    err.data = data
    throw err
  }
  return data
}

const srv = (json) => ({ apikey: SRV, Authorization: `Bearer ${SRV}`, ...(json ? {} : {}) })
const srvRep = () => ({ apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
const usr = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}` })

const ts = Date.now()
const nameA = `ITEST-A-${ts}`
const nameB = `ITEST-B-${ts}`

async function createTenant(name) {
  const [t] = await call('/rest/v1/tenants', { method: 'POST', headers: srvRep(), body: { business_name: name } })
  await call('/rest/v1/business_settings', { method: 'POST', headers: srv(true), body: { tenant_id: t.id, business_name: name, currency: 'PHP', currency_symbol: '₱' } })
  await call('/rest/v1/products', { method: 'POST', headers: srv(true), body: {
    tenant_id: t.id, name: `PROD-${name}`, sku: `SKU-${ts}-${name}`, category: 'Test', base_unit: 'Piece',
    base_price: 100, cost_price: 50, stock_quantity: 10, low_stock_threshold: 1,
  } })
  return { id: t.id, name }
}

async function createUser(email) {
  const pw = 'test1234'
  const u = await call('/auth/v1/admin/users', { method: 'POST', headers: srv(true), body: {
    email, password: pw, email_confirm: true, user_metadata: { full_name: email },
  } })
  const { access_token } = await call(`/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON },
    body: { email, password: pw },
  })
  return { id: u.id, email, token: access_token }
}

async function patchProfile(id, patch) {
  await call(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: srv(true), body: patch })
}

let tenantA, tenantB, x, a, b, c
const results = []
const check = async (name, fn) => {
  try { await fn(); results.push([name, true, '']) }
  catch (e) { results.push([name, false, e.message]) }
}

try {
  tenantA = await createTenant(nameA)
  tenantB = await createTenant(nameB)

  x = await createUser(`itest-x-${ts}@blink.test`)   // member of BOTH stores
  a = await createUser(`itest-a-${ts}@blink.test`)   // only store A
  b = await createUser(`itest-b-${ts}@blink.test`)   // only store B
  c = await createUser(`itest-c-${ts}@blink.test`)   // only store B (trigger check)

  // x joined A as admin via normal join path -> profile PATCH (trigger syncs membership)
  await patchProfile(x.id, { tenant_id: tenantA.id, role: 'admin' })
  // x invited/became a member of B as cashier -> direct membership (invite-join result)
  await call('/rest/v1/memberships', { method: 'POST', headers: srvRep(), body: { user_id: x.id, tenant_id: tenantB.id, role: 'cashier' } })
  await patchProfile(a.id, { tenant_id: tenantA.id, role: 'cashier' })
  await patchProfile(b.id, { tenant_id: tenantB.id, role: 'cashier' })
  await patchProfile(c.id, { tenant_id: tenantB.id, role: 'admin' })

  const prodA = `PROD-${nameA}`
  const prodB = `PROD-${nameB}`

  // ---- 1. Trigger sync: profiles role/tenant -> memberships ----
  await check('trigger syncs membership on profile join (x: A+admin, B+cashier)', async () => {
    const m = await call(`/rest/v1/memberships?select=tenant_id,role&user_id=eq.${x.id}`, { headers: srv() })
    const got = m.map((r) => `${r.tenant_id}:${r.role}`).sort()
    const want = [tenantA.id, tenantB.id]
    if (got.length !== 2) throw new Error(`expected 2 memberships, got ${JSON.stringify(got)}`)
    const byTenant = m.reduce((acc, r) => (acc[r.tenant_id] = r.role, acc), {})
    if (byTenant[tenantA.id] !== 'admin') throw new Error(`A role ${byTenant[tenantA.id]} != admin`)
    if (byTenant[tenantB.id] !== 'cashier') throw new Error(`B role ${byTenant[tenantB.id]} != cashier`)
    if (!want.every((id) => id in byTenant)) throw new Error('missing expected membership')
  })

  await check('trigger syncs membership for c (B:admin)', async () => {
    const m = await call(`/rest/v1/memberships?select=tenant_id,role&user_id=eq.${c.id}`, { headers: srv() })
    if (m.length !== 1 || m[0].role !== 'admin' || m[0].tenant_id !== tenantB.id) throw new Error(`bad ${JSON.stringify(m)}`)
  })

  // ---- 2. Users can see only their own businesses ----
  await check('x lists own 2 businesses (RLS as user)', async () => {
    const m = await call(`/rest/v1/memberships?select=tenant_id,role`, { headers: usr(x.token) })
    if (m.length !== 2) throw new Error(`x sees ${m.length} memberships`)
  })

  await check('a (A-only) lists only own business', async () => {
    const m = await call(`/rest/v1/memberships?select=tenant_id,role`, { headers: usr(a.token) })
    if (m.length !== 1 || m[0].tenant_id !== tenantA.id) throw new Error(`bad ${JSON.stringify(m)}`)
  })

  await check('switcher can read both tenant names (tenants_read_member)', async () => {
    const t = await call(`/rest/v1/tenants?select=id,business_name`, { headers: usr(x.token) })
    const names = t.map((r) => r.business_name)
    if (!names.includes(nameA) || !names.includes(nameB)) throw new Error(`missing ${nameA}/${nameB}: ${JSON.stringify(names)}`)
  })

  // ---- 3. ACTIVE-context isolation (the core promise: products never mix) ----
  await check('x active in A sees ONLY A products', async () => {
    const p = await call('/rest/v1/products?select=name', { headers: usr(x.token) })
    const names = p.map((r) => r.name)
    if (names.includes(prodB)) throw new Error(`leak: B product visible from A context: ${JSON.stringify(names)}`)
    if (!names.includes(prodA)) throw new Error(`A product missing: ${JSON.stringify(names)}`)
  })

  await check('x switch_business(A->B) succeeds, sees ONLY B products + B settings', async () => {
    await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(x.token), body: { p_tenant: tenantB.id } })
    const p = await call('/rest/v1/products?select=name', { headers: usr(x.token) })
    const names = p.map((r) => r.name)
    if (names.includes(prodA)) throw new Error(`leak: A product visible from B context`)
    if (!names.includes(prodB)) throw new Error(`B product missing`)
    const s = await call(`/rest/v1/business_settings?select=business_name&tenant_id=eq.${tenantB.id}`, { headers: usr(x.token) })
    if (s[0]?.business_name !== nameB) throw new Error(`wrong settings after switch`)
  })

  await check('x switch back (B->A) restores A context + admin role', async () => {
    await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(x.token), body: { p_tenant: tenantA.id } })
    const p = await call('/rest/v1/products?select=name', { headers: usr(x.token) })
    const names = p.map((r) => r.name)
    if (names.includes(prodB)) throw new Error(`leak after switching back`)
    if (!names.includes(prodA)) throw new Error(`A missing after switching back`)
    const prof = await call(`/rest/v1/profiles?select=role,tenant_id&id=eq.${x.id}`, { headers: usr(x.token) })
    if (prof[0]?.role !== 'admin' || prof[0]?.tenant_id !== tenantA.id) throw new Error(`role/tenant wrong after switch back: ${JSON.stringify(prof)}`)
  })

  // ---- 4. Per-tenant role integrity ----
  await check('x role is cashier in B, admin in A (per-tenant)', async () => {
    await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(x.token), body: { p_tenant: tenantB.id } })
    let prof = await call(`/rest/v1/profiles?select=role&id=eq.${x.id}`, { headers: usr(x.token) })
    if (prof[0]?.role !== 'cashier') throw new Error(`expected cashier in B, got ${prof[0]?.role}`)
    await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(x.token), body: { p_tenant: tenantA.id } })
    prof = await call(`/rest/v1/profiles?select=role&id=eq.${x.id}`, { headers: usr(x.token) })
    if (prof[0]?.role !== 'admin') throw new Error(`expected admin in A, got ${prof[0]?.role}`)
  })

  // ---- 5. Hard RLS isolation: non-members get NOTHING ----
  await check('a (A-only) cannot read B products even via tenant filter', async () => {
    const p = await call(`/rest/v1/products?tenant_id=eq.${tenantB.id}&select=name`, { headers: usr(a.token) })
    if (p.length !== 0) throw new Error(`leak: got ${JSON.stringify(p.map((r) => r.name))}`)
  })

  await check('b (B-only) cannot read A products', async () => {
    const p = await call(`/rest/v1/products?tenant_id=eq.${tenantA.id}&select=name`, { headers: usr(b.token) })
    if (p.length !== 0) throw new Error(`leak`)
  })

  await check('x (member of B) still sealed off from B while ACTIVE in A', async () => {
    const p = await call(`/rest/v1/products?tenant_id=eq.${tenantB.id}&select=name`, { headers: usr(x.token) })
    if (p.length !== 0) throw new Error(`cross-store leak by tenant filter`)
  })

  // ---- 6. switch_business refuses non-members ----
  await check('switch_business(B) rejected for A-only member', async () => {
    let rejected = false
    try {
      await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(a.token), body: { p_tenant: tenantB.id } })
    } catch (e) {
      rejected = /not a member/i.test(e.message)
      if (!rejected) throw new Error(`unexpected error: ${e.message}`)
    }
    if (!rejected) throw new Error('non-member switch was allowed!')
  })

  // ---- 7. Self-escalation is blocked (hardening) ----
  await check('user cannot self-assign a different tenant_id', async () => {
    let blocked = false
    try {
      await call(`/rest/v1/profiles?id=eq.${a.id}`, { method: 'PATCH', headers: usr(a.token), body: { tenant_id: tenantB.id } })
    } catch (e) { blocked = true }
    if (!blocked) throw new Error('self tenant change was allowed!')
    const prof = await call(`/rest/v1/profiles?select=tenant_id&id=eq.${a.id}`, { headers: usr(a.token) })
    if (prof[0]?.tenant_id !== tenantA.id) throw new Error(`tenant_id actually changed`)
  })

  await check('user cannot self-assign role or platform_role', async () => {
    let blocked = false
    try {
      await call(`/rest/v1/profiles?id=eq.${a.id}`, { method: 'PATCH', headers: usr(a.token), body: { platform_role: 'superadmin' } })
    } catch (e) { blocked = true }
    if (!blocked) throw new Error('self platform_role escalation allowed!')
    let blocked2 = false
    try {
      await call(`/rest/v1/profiles?id=eq.${a.id}`, { method: 'PATCH', headers: usr(a.token), body: { role: 'admin' } })
    } catch (e) { blocked2 = true }
    if (!blocked2) throw new Error('self role change allowed!')
  })

  // ---- 8. Admin may manage co-workers in their active tenant only ----
  await check('x (admin in A) can promote co-worker within A', async () => {
    await call(`/rest/v1/profiles?id=eq.${a.id}`, { method: 'PATCH', headers: usr(x.token), body: { role: 'admin' } })
    const prof = await call(`/rest/v1/profiles?select=role&id=eq.${a.id}`, { headers: usr(x.token) })
    if (prof[0]?.role !== 'admin') throw new Error(`promote failed: ${JSON.stringify(prof)}`)
    const mem = await call(`/rest/v1/memberships?select=role&user_id=eq.${a.id}&tenant_id=eq.${tenantA.id}`, { headers: srv() })
    if (mem[0]?.role !== 'admin') throw new Error(`membership role not synced: ${JSON.stringify(mem)}`)
  })

  await check('x (active in A) cannot manage a B co-worker', async () => {
    await call(`/rest/v1/profiles?id=eq.${b.id}`, { method: 'PATCH', headers: usr(x.token), body: { role: 'admin' } })
    const prof = await call(`/rest/v1/profiles?select=role&id=eq.${b.id}`, { headers: srv() })
    if (prof[0]?.role !== 'cashier') throw new Error(`cross-store edit had an effect: ${JSON.stringify(prof)}`)
  })

  // ---- 9. Admin capability follows active context in RLS ----
  await check('x can create a product in A while admin there', async () => {
    await call('/rest/v1/products', { method: 'POST', headers: usr(x.token), body: {
      tenant_id: tenantA.id, name: 'ADMIN-INSERT-A', sku: `ADM-${ts}-A`, category: 'Test', base_unit: 'Piece',
      base_price: 1, cost_price: 1, stock_quantity: 1,
    } })
  })

  await check('x cannot create a product in A while cashier in B', async () => {
    await call('/rest/v1/rpc/switch_business', { method: 'POST', headers: usr(x.token), body: { p_tenant: tenantB.id } })
    let blocked = false
    try {
      await call('/rest/v1/products', { method: 'POST', headers: usr(x.token), body: {
        tenant_id: tenantA.id, name: 'SHOULD-FAIL-A', sku: `SKU-FAIL-${ts}`, category: 'Test', base_unit: 'Piece',
        base_price: 1, cost_price: 1, stock_quantity: 1,
      } })
    } catch (e) { blocked = true }
    if (!blocked) throw new Error('cashier-in-B inserted into A!')
  })

  await check('b (cashier in B) cannot create products', async () => {
    let blocked = false
    try {
      await call('/rest/v1/products', { method: 'POST', headers: usr(b.token), body: {
        tenant_id: tenantB.id, name: 'CASHIER-INSERT', sku: `CAS-${ts}-B`, category: 'Test', base_unit: 'Piece',
        base_price: 1, cost_price: 1, stock_quantity: 1,
      } })
    } catch (e) { blocked = true }
    if (!blocked) throw new Error('cashier created a product!')
  })
} finally {
  // ---- cleanup: delete tenants (cascades settings/products/memberships) ----
  for (const t of [tenantA, tenantB]) {
    if (t) { try { await call(`/rest/v1/tenants?id=eq.${t.id}`, { method: 'DELETE', headers: srv() }) } catch {} }
  }
  for (const u of [x, a, b, c]) {
    if (u) { try { await call(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: srv() }) } catch {} }
  }
}

const pass = results.filter(([, ok]) => ok).length
const fail = results.length - pass
console.log('')
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${msg}`}`)
}
console.log('')
console.log(`RESULT: ${pass}/${results.length} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)