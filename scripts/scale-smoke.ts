// Requires: JWT_SECRET=... docker compose -f compose.scale.yml up --build
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'

const bases = ['http://localhost:3009', 'http://127.0.0.1:3009']
const workers = await Promise.all(bases.map(async (base, index) => {
  const response = await fetch(`${base}/api/instruments`)
  assert.equal(response.status, 200)
  const worker = response.headers.get('x-demo-worker')
  assert.equal(worker, index === 0 ? 'a' : 'b')
  return worker
}))
const base = bases[0]!
const tokenResponse = await fetch(`${base}/api/auth/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'scale-check' }),
})
assert.equal(tokenResponse.status, 200)
const { token } = await tokenResponse.json() as { token: string }
const sockets = workers.map((_, index) => io(bases[index], {
  transports: ['polling'], reconnection: false, auth: { token },
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
  const books = await Promise.all(workers.map(async (_, index) => {
    const response = await fetch(`${bases[index]}/api/instruments/ACME/book`)
    return response.json() as Promise<{ seq: number; dernierPrix: number }>
  }))
  assert.ok(Math.abs(books[0]!.seq - books[1]!.seq) <= 1)
  if (books[0]!.seq === books[1]!.seq) assert.equal(books[0]!.dernierPrix, books[1]!.dernierPrix)
  console.log(`OK: pinned workers ${workers.join(' / ')} + shared bid, idempotency and market state`)
} finally {
  sockets.forEach((socket) => socket.disconnect())
}
