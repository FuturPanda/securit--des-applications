// Reproduces the live audit findings against an isolated local instance.
// No external service is contacted, and the SSE check opens only 20 connections.
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { io as client, type Socket } from 'socket.io-client'
import WebSocket from 'ws'
import { registerRoutes } from '../src/rest.ts'
import { createStore } from '../src/store.ts'
import { startSocketIoServer } from '../src/realtime/socketio/server.ts'
import { SECRET, verifyJwtPayload } from '../src/realtime/ws/security-helpers.ts'

const app = Fastify()
await app.register(fastifyStatic, { root: fileURLToPath(new URL('../public', import.meta.url)) })
const store = createStore()
registerRoutes(app, store)
const io = startSocketIoServer(app.server, store)
const sockets: Socket[] = []
const streams: ReadableStreamDefaultReader<Uint8Array>[] = []

async function connect(base: string, token: string): Promise<Socket> {
  const socket = client(base, { transports: ['websocket'], auth: { token }, reconnection: false })
  sockets.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

function bid(socket: Socket, requestId: string): Promise<{ ok: boolean; bid?: { id: string; userId: string } }> {
  return new Promise((resolve) => socket.emit('bid:place', {
    requestId, instrument: 'ACME', prix: 100, quantite: 1,
  }, resolve))
}

await app.listen({ host: '127.0.0.1', port: 0 })
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`
try {
  const tokenResponse = await fetch(`${base}/api/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice' }),
  })
  assert.equal(tokenResponse.status, 200)
  const { token } = await tokenResponse.json() as { token: string }
  assert.equal(verifyJwtPayload(token, SECRET)?.sub, 'alice')
  const alice = await connect(base, token)
  assert.equal((await bid(alice, 'first')).bid?.userId, 'alice')
  console.log('F1: anonymous caller got an alice token and an accepted alice bid')

  for (let n = 0; n < 20; n++) {
    const response = await fetch(`${base}/api/stream?instrument=ACME`)
    assert.equal(response.status, 200)
    streams.push(response.body!.getReader())
  }
  console.log('F3: 20 simultaneous unauthenticated SSE streams accepted (no rejection; not an outage test)')

  const shortToken = jwt.sign({ sub: 'expiry-test' }, SECRET, { expiresIn: '1s' })
  const expiring = await connect(base, shortToken)
  await new Promise((resolve) => setTimeout(resolve, 1_200))
  assert.equal(verifyJwtPayload(shortToken, SECRET), null)
  assert.equal((await bid(expiring, 'after-expiry')).ok, true)
  console.log('F4: expired token rejected by verifyJwtPayload, but existing socket accepted bid')

  const one = await bid(alice, '')
  const two = await bid(alice, '')
  assert.equal(one.ok, true)
  assert.equal(two.ok, true)
  assert.notEqual(one.bid?.id, two.bid?.id)
  console.log(`F5: same empty requestId accepted twice as ${one.bid?.id} and ${two.bid?.id}`)

  const legacy = await fetch(`${base}/index-old-naive-ws.html`)
  assert.equal(legacy.status, 200)
  const wsOutcome = await new Promise<string>((resolve) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws'))
    ws.once('open', () => resolve('connected'))
    ws.once('error', (error) => resolve(error.message))
  })
  assert.notEqual(wsOutcome, 'connected')
  console.log(`CodeQL triage: legacy HTML is served, but its bare / WebSocket cannot connect (${wsOutcome})`)
} finally {
  for (const socket of sockets) socket.disconnect()
  for (const stream of streams) await stream.cancel()
  io.close()
  await app.close()
}
