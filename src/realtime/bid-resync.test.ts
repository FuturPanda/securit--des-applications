// Rattrapage des bids apres une coupure Socket.IO, dans les deux modes.
// Redis : REDIS_URL=redis://127.0.0.1:6379 npx tsx src/realtime/bid-resync.test.ts
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { io as client } from 'socket.io-client'
import { ajouterBid, createStore } from '../store.ts'
import { connectMarket } from './redis-market.ts'
import { startSocketIoServer } from './socketio/server.ts'
import { createJwt, SECRET } from './ws/security-helpers.ts'
import type { Bid } from '../domain.ts'

interface Resync { type: 'replay' | 'snapshot' | 'refus'; bids: Bid[] }

const nouveauBid = (index: number) => ({
  requestId: `resync-${index}`,
  instrument: 'ACME',
  userId: 'ada',
  prix: 100 + index,
  quantite: 1,
  source: 'socket' as const,
})

async function connecter(base: string) {
  const socket = client(base, {
    transports: ['websocket'], auth: { token: createJwt('ada', SECRET) }, reconnection: false,
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

const resync = (socket: ReturnType<typeof client>, depuis: number) =>
  new Promise<Resync>((resolve) => socket.emit('bid:resync', depuis, resolve))

// ---------------------------------------------------------------- mode memoire
{
  const store = createStore()
  const app = Fastify()
  startSocketIoServer(app.server, store)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`
  const socket = await connecter(base)
  try {
    for (let i = 1; i <= 40; i++) ajouterBid(store, nouveauBid(i))

    const court = await resync(socket, 35)
    assert.equal(court.type, 'replay')
    assert.deepEqual(court.bids.map((bid) => bid.id), ['bid-36', 'bid-37', 'bid-38', 'bid-39', 'bid-40'])

    // bidsRecents est borne a 100 : un trou plus ancien n'est plus rejouable.
    for (let i = 41; i <= 200; i++) ajouterBid(store, nouveauBid(i))
    const long = await resync(socket, 35)
    assert.equal(long.type, 'snapshot')
    assert.equal(long.bids.length, 30)
    console.log('OK: mode memoire — rejeu court, puis instantane quand le buffer est depasse')
  } finally {
    socket.disconnect()
    await app.close()
  }
}

// ------------------------------------------------------------------ mode Redis
{
  const base = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
  const url = `${base.replace(/\/\d+$/, '')}/15` // base de travail dediee
  const market = await connectMarket(url)
  await market.redis.flushDb()
  await market.init()
  const app = Fastify()
  startSocketIoServer(app.server, createStore(), market)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const adresse = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`
  const socket = await connecter(adresse)
  try {
    for (let i = 1; i <= 40; i++) await market.bid(nouveauBid(i))

    const rejeu = await resync(socket, 5)
    assert.equal(rejeu.type, 'replay')
    // 35 bids, donc strictement plus que les 30 de `bid:history` : le journal couvre tout.
    assert.equal(rejeu.bids.length, 35)
    assert.equal(rejeu.bids[0]!.id, 'bid-6')
    assert.equal(rejeu.bids.at(-1)!.id, 'bid-40')

    const depuisZero = await resync(socket, 0)
    assert.equal(depuisZero.type, 'snapshot')
    console.log('OK: mode Redis — rejeu complet au-dela des 30 de bid:history')
  } finally {
    socket.disconnect()
    await app.close()
    await market.redis.flushDb()
    await market.redis.quit()
  }
}
