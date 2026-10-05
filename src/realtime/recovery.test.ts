import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { io as client } from 'socket.io-client'
import { createStore, avancer } from '../store.ts'
import { registerRoutes } from '../rest.ts'
import { startSocketIoServer } from './socketio/server.ts'
import { createJwt, SECRET } from './ws/security-helpers.ts'

const app = Fastify()
const store = createStore()
const publish = registerRoutes(app, store)
const io = startSocketIoServer(app.server, store)
const sockets: ReturnType<typeof client>[] = []
const readers: ReadableStreamDefaultReader<Uint8Array>[] = []

async function stream(url: string, id?: number) {
  const response = await fetch(url, { headers: id === undefined ? {} : { 'Last-Event-ID': String(id) } })
  assert.equal(response.status, 200)
  const reader = response.body!.getReader()
  readers.push(reader)
  let buffer = ''
  return async () => {
    while (true) {
      const end = buffer.indexOf('\n\n')
      if (end >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (!frame.includes('event:')) continue
        const event = frame.match(/event: (.+)/)?.[1]
        const data = frame.match(/data: (.+)/)?.[1]
        return { event, data: JSON.parse(data!), id: Number(frame.match(/id: (\d+)/)?.[1]) }
      }
      const result = await reader.read()
      assert.equal(result.done, false)
      buffer += new TextDecoder().decode(result.value)
    }
  }
}

async function main() {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`
  const url = `${base}/api/stream?instrument=ACME`
  try {
    assert.equal((await fetch(`${base}/api/stream?instrument=NOPE`)).status, 404)
    const first = await stream(url)
    const second = await stream(url)
    assert.equal((await first()).event, 'snapshot')
    assert.equal((await second()).event, 'snapshot')
    avancer(store)
    publish(store.carnets.get('GLOB')!)
    publish(store.carnets.get('ACME')!)
    const initialDelta = await first()
    assert.equal(initialDelta.event, 'delta')
    assert.equal(initialDelta.id, 1)
    assert.equal((await second()).id, 1)
    await readers.pop()!.cancel()
    await readers.pop()!.cancel()

    for (let i = 0; i < 3; i++) {
      avancer(store)
      publish(store.carnets.get('ACME')!)
    }
    const replay = await stream(url, 1)
    assert.deepEqual((await replay()).data, { type: 'replay', count: 3 })
    for (const seq of [2, 3, 4]) {
      const event = await replay()
      assert.equal(event.id, seq)
      assert.equal(event.data.seq, seq)
      assert.equal(event.data.carnet.instrument, 'ACME')
      assert.equal(typeof event.data.carnet.dernierPrix, 'number')
    }
    await readers.pop()!.cancel()

    for (let i = 0; i < 51; i++) {
      avancer(store)
      publish(store.carnets.get('ACME')!)
    }
    const expired = await stream(url, 1)
    assert.deepEqual((await expired()).data, { type: 'snapshot' })
    assert.equal((await expired()).event, 'snapshot')
    await readers.pop()!.cancel()

    const connect = async (user: string) => {
      const socket = client(base, { transports: ['websocket'], auth: { token: createJwt(user, SECRET) } })
      sockets.push(socket)
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })
      return socket
    }
    const watch = (socket: ReturnType<typeof client>, sym: string) =>
      new Promise<{ ok: boolean }>((resolve) => socket.emit('watch', sym, resolve))
    const ada = await connect('ada')
    const linus = await connect('linus')
    assert.deepEqual(await watch(ada, 'ACME'), { ok: true })
    const both = new Promise<number>((resolve) => linus.once('presence', ({ count }) => resolve(count)))
    assert.deepEqual(await watch(linus, 'ACME'), { ok: true })
    assert.equal(await both, 2)
    const presence = new Promise<number>((resolve) => linus.once('presence', ({ count }) => resolve(count)))
    assert.deepEqual(await watch(ada, 'GLOB'), { ok: true })
    assert.equal(await presence, 1)
    linus.disconnect()
    const returned = await connect('linus')
    assert.deepEqual(await watch(returned, 'ACME'), { ok: true })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(await watch(ada, 'ACME'), { ok: true })
    const departed = new Promise<number>((resolve) => ada.on('presence', ({ count }) => {
      if (count === 1) resolve(count)
    }))
    returned.disconnect()
    assert.equal(await departed, 1)
    console.log('OK: SSE snapshot, short replay, expired snapshot, Socket.IO rooms and 5s grace')
  } finally {
    for (const socket of sockets) socket.disconnect()
    for (const reader of readers) await reader.cancel()
    io.close()
    await app.close()
  }
}

await main()
