// Run with REDIS_URL=redis://127.0.0.1:6379 npx tsx src/realtime/redis.test.ts
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { io as client } from 'socket.io-client'
import { createStore } from '../store.ts'
import { startSocketIoServer, attachRedisAdapter } from './socketio/server.ts'
import { createJwt, SECRET } from './ws/security-helpers.ts'

const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const servers = await Promise.all([0, 1].map(async () => {
  const app = Fastify()
  const io = startSocketIoServer(app.server, createStore())
  const closeRedis = await attachRedisAdapter(io, url)
  await app.listen({ port: 0, host: '127.0.0.1' })
  return { app, io, closeRedis, base: `http://127.0.0.1:${(app.server.address() as { port: number }).port}` }
}))
const sockets: ReturnType<typeof client>[] = []
try {
  for (const [index, user] of ['ada', 'linus'].entries()) {
    const socket = client(servers[index]!.base, {
      transports: ['websocket'], auth: { token: createJwt(user, SECRET) }, reconnection: false,
    })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
  }
  const received = new Promise<{ userId: string }>((resolve) => sockets[1]!.once('bid:new', resolve))
  const ack = await new Promise<{ ok: boolean }>((resolve) => sockets[0]!.emit('bid:place', {
    requestId: 'redis-test', instrument: 'ACME', prix: 100, quantite: 1,
  }, resolve))
  assert.equal(ack.ok, true)
  const bid = await Promise.race([received, new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Redis fan-out timeout')), 2_000)
  })])
  assert.equal(bid.userId, 'ada')
  console.log('OK: bid from app-a reaches a socket on app-b through Redis')
} finally {
  sockets.forEach((socket) => socket.disconnect())
  for (const server of servers) {
    server.io.close()
    await server.app.close()
    await server.closeRedis()
  }
}
