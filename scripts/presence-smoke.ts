// Requires compose.scale.yml running; two workers, same user on both, then a second user.
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'

const base = 'http://127.0.0.1:3009'
const cookies: string[] = []
for (let i = 0; i < 20 && cookies.length < 2; i++) {
  const response = await fetch(`${base}/api/instruments`, { headers: { Connection: 'close' } })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie?.startsWith('SERVER='))
  if (!cookies.includes(cookie)) cookies.push(cookie)
  if (cookies.length < 2) await new Promise((resolve) => setTimeout(resolve, 250))
}
assert.equal(cookies.length, 2)
async function token(username: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }),
  })
  assert.equal(response.status, 200)
  return (await response.json() as { token: string }).token
}
const [ada, linus] = await Promise.all([token('ada'), token('linus')])
const sockets = [
  io(base, { transports: ['polling'], reconnection: false, auth: { token: ada }, extraHeaders: { Cookie: cookies[0] } }),
  io(base, { transports: ['polling'], reconnection: false, auth: { token: ada }, extraHeaders: { Cookie: cookies[1] } }),
  io(base, { transports: ['polling'], reconnection: false, auth: { token: linus }, extraHeaders: { Cookie: cookies[1] } }),
]
const waitCount = (index: number, expected: number, timeout = 10_000) => new Promise<void>((resolve, reject) => {
  const socket = sockets[index]!
  const timer = setTimeout(() => { socket.off('presence', received); reject(new Error(`No count ${expected} on worker ${index}`)) }, timeout)
  const received = ({ instrument, count }: { instrument: string; count: number }) => {
    if (instrument !== 'ACME' || count !== expected) return
    clearTimeout(timer)
    socket.off('presence', received)
    resolve()
  }
  socket.on('presence', received)
})
const watch = (index: number) => new Promise<{ ok: boolean }>((resolve) => sockets[index]!.emit('watch', 'ACME', resolve))
try {
  await Promise.all(sockets.map((socket) => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })))
  assert.deepEqual(await watch(0), { ok: true })
  const sameUser = waitCount(0, 1)
  assert.deepEqual(await watch(1), { ok: true })
  await sameUser
  const first = waitCount(0, 2)
  const second = waitCount(2, 2)
  assert.deepEqual(await watch(2), { ok: true })
  await Promise.all([first, second])
  let early = false
  const one = ({ count }: { count: number }) => { if (count === 1) early = true }
  sockets[0]!.on('presence', one)
  const departed = waitCount(0, 1)
  sockets[2]!.disconnect()
  await new Promise((resolve) => setTimeout(resolve, 4_000))
  assert.equal(early, false, '5-second grace must retain the viewer')
  await departed
  console.log(`OK: ${cookies.join(' / ')} report 2 distinct users, deduplicate tabs and honor grace`)
} finally {
  sockets.forEach((socket) => socket.disconnect())
}
