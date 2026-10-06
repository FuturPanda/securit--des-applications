// Requires: JWT_SECRET=... docker compose -f compose.scale.yml up --build
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'

const base = 'http://127.0.0.1:3009'
const cookies: string[] = []
for (let i = 0; i < 20 && cookies.length < 2; i++) {
  const response = await fetch(`${base}/api/instruments`, { headers: { Connection: 'close' } })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie?.startsWith('SERVER='))
  if (!cookies.includes(cookie)) cookies.push(cookie)
  if (cookies.length < 2) await new Promise((resolve) => setTimeout(resolve, 250))
}
assert.equal(cookies.length, 2, 'both workers must be healthy')
const tokenResponse = await fetch(`${base}/api/auth/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'scale-check' }),
})
assert.equal(tokenResponse.status, 200)
const { token } = await tokenResponse.json() as { token: string }
const sockets = cookies.map((cookie) => io(base, {
  transports: ['polling'], reconnection: false, auth: { token }, extraHeaders: { Cookie: cookie },
}))
try {
  await Promise.all(sockets.map((socket) => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })))
  const requestId = `scale-smoke-${Date.now()}`
  const received = new Promise<{ userId: string; id: string }>((resolve) => sockets[1]!.once('bid:new', resolve))
  const ack = await new Promise<{ ok: boolean }>((resolve) => sockets[0]!.emit('bid:place', {
    requestId, instrument: 'ACME', prix: 100, quantite: 1,
  }, resolve))
  assert.equal(ack.ok, true)
  const bid = await Promise.race([received, new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('cross-worker broadcast timeout')), 3_000)
  })])
  assert.equal(bid.userId, 'scale-check')
  const duplicate = await new Promise<{ ok: boolean; bid: { id: string } }>((resolve) => sockets[1]!.emit('bid:place', {
    requestId, instrument: 'ACME', prix: 100, quantite: 1,
  }, resolve))
  assert.equal(duplicate.ok, true)
  assert.equal(duplicate.bid.id, bid.id)
  const books = await Promise.all(cookies.map(async (cookie) => {
    const response = await fetch(`${base}/api/instruments/ACME/book`, { headers: { Cookie: cookie } })
    return response.json() as Promise<{ seq: number; dernierPrix: number }>
  }))
  assert.ok(Math.abs(books[0]!.seq - books[1]!.seq) <= 1)
  if (books[0]!.seq === books[1]!.seq) assert.equal(books[0]!.dernierPrix, books[1]!.dernierPrix)
  console.log(`OK: sticky ${cookies.join(' / ')} + shared bid, idempotency and market state`)
} finally {
  sockets.forEach((socket) => socket.disconnect())
}
