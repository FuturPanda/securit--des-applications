// With compose.scale.yml running, prove a full-history replay on either worker.
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:3009'
const cookies = new Set<string>()
for (let i = 0; i < 20 && cookies.size < 2; i++) {
  const response = await fetch(`${base}/api/instruments`, { headers: { Connection: 'close' } })
  assert.equal(response.status, 200)
  cookies.add(response.headers.get('set-cookie')!.split(';')[0]!)
  if (cookies.size < 2) await new Promise((resolve) => setTimeout(resolve, 250))
}
assert.equal(cookies.size, 2)

async function firstDelta(cookie: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  const response = await fetch(`${base}/api/stream?instrument=ACME&from=0`, {
    headers: { Cookie: cookie }, signal: controller.signal,
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
const [first, second] = await Promise.all([...cookies].map(firstDelta))
assert.deepEqual(first, second)
console.log('OK: both workers replay identical first event from Redis')
