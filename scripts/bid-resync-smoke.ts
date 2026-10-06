// Rejouer les bids manques pendant une coupure Socket.IO, contre un serveur deja lance.
// Lancer d'abord : npm run start:redis    puis : npx tsx scripts/bid-resync-smoke.ts
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import type { Bid } from '../src/domain.ts'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3009'
const token = async (username: string) => {
  const response = await fetch(`${base}/api/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }),
  })
  assert.equal(response.status, 200)
  return (await response.json() as { token: string }).token
}
const numeroBid = (id: string) => Number(id.slice('bid-'.length))
const connecter = async (jeton: string) => {
  const socket = io(base, { transports: ['websocket'], auth: { token: jeton }, reconnection: false })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}
const placer = (socket: ReturnType<typeof io>, requestId: string) =>
  new Promise<{ ok: boolean; bid: Bid }>((resolve) => socket.emit('bid:place', {
    requestId, instrument: 'ACME', prix: 100, quantite: 1,
  }, resolve))

const [spectateur, emetteur] = await Promise.all([token('spectateur'), token('emetteur')])
let observateur = await connecter(spectateur)
const auteur = await connecter(emetteur)
try {
  // Un bid de reference avant la coupure, pour avoir un point de reprise non nul.
  const avant = new Promise<Bid>((resolve) => observateur.once('bid:new', resolve))
  assert.equal((await placer(auteur, `resync-smoke-ref-${Date.now()}`)).ok, true)
  const dernierAvantCoupure = numeroBid((await avant).id)
  assert.ok(dernierAvantCoupure > 0)

  observateur.disconnect() // la coupure WebSocket de la demo
  const manques: string[] = []
  for (let i = 0; i < 3; i++) {
    const ack = await placer(auteur, `resync-smoke-${Date.now()}-${i}`)
    assert.equal(ack.ok, true)
    manques.push(ack.bid.id)
  }

  observateur = await connecter(spectateur)
  const rattrapage = await new Promise<{ type: string; bids: Bid[] }>((resolve) => {
    observateur.emit('bid:resync', dernierAvantCoupure, resolve)
  })
  assert.equal(rattrapage.type, 'replay')
  const recus = rattrapage.bids.map((bid) => bid.id)
  for (const id of manques) assert.ok(recus.includes(id), `bid manque non rejoue : ${id}`)
  console.log(`OK: ${manques.length} bids emis pendant la coupure, ${recus.length} rejoues depuis bid-${dernierAvantCoupure}`)
} finally {
  observateur.disconnect()
  auteur.disconnect()
}
