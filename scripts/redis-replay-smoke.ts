// With compose.scale.yml running, prove a full-history replay on either worker.
import assert from 'node:assert/strict'

const bases = ['http://localhost:3009', 'http://127.0.0.1:3009']
await Promise.all(bases.map(async (base, index) => {
  const response = await fetch(`${base}/api/instruments`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-demo-worker'), index === 0 ? 'a' : 'b')
}))

async function firstDelta(base: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  const response = await fetch(`${base}/api/stream?instrument=ACME&from=0`, {
    signal: controller.signal,
  })
  assert.equal(response.status, 200)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('SSE closed before replay')
      text += decoder.decode(value)
      const match = text.match(/id: 1\nevent: delta\ndata: ([^\n]+)/)
      if (match) return JSON.parse(match[1]!) as { seq: number; carnet: unknown }
    }
  } finally {
    clearTimeout(timeout)
    controller.abort()
    await reader.cancel().catch(() => {})
  }
}
const [first, second] = await Promise.all(bases.map(firstDelta))
assert.deepEqual(first, second)
console.log('OK: both workers replay identical first event from Redis')
