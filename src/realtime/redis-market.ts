import { createClient, WatchError } from 'redis'
import type { Bid, CarnetOrdres } from '../domain.ts'
import { ajouterBid, avancer, createStore, numeroBid, type NouveauBid, type Store } from '../store.ts'

const STATE = 'cotations:state'
const EVENTS = 'cotations:events'
const BIDS = 'cotations:bids'
const prices = (sym: string) => `cotations:prices:${sym}`
const presence = (sym: string) => `cotations:presence:${sym}`
const viewer = (user: string, socketId: string) => JSON.stringify([user, socketId])
type Client = ReturnType<typeof createClient>

// One Redis transaction is the authority for market state, history and replay indexes.
// ponytail: untrimmed full-book ticks and whole-state CAS grow disk/CPU without bound;
// move bids to Redis hashes and archive old ticks if this outgrows a classroom demo.
export class RedisMarket {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(readonly redis: Client) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    // Redis WATCH is connection-scoped: never interleave two writers on this client.
    const result = this.pending.then(operation)
    this.pending = result.catch(() => {})
    return result
  }

  async init() {
    const seed = createStore()
    for (const carnet of seed.carnets.values()) carnet.seq = 0
    await this.redis.set(STATE, encode(seed), { NX: true })
  }

  async read(): Promise<Store> {
    const data = await this.redis.get(STATE)
    if (!data) throw new Error('Redis market not initialized')
    return decode(data)
  }

  tick(): Promise<Bid | null> {
    return this.serialize(async () => { for (;;) {
      await this.redis.watch(STATE)
      try {
        const state = await this.read()
        const now = Date.now()
        if (now - (state.lastTickAt ?? 0) < 500) return null
        state.lastTickAt = now
        const bid = avancer(state)
        const transaction = this.redis.multi().set(STATE, encode(state))
        if (bid) {
          transaction.xAdd(EVENTS, '*', { type: 'bid', data: JSON.stringify(bid) })
          transaction.zAdd(BIDS, { score: numeroBid(bid.id), value: JSON.stringify(bid) })
        }
        for (const carnet of state.carnets.values()) {
          transaction.zAdd(prices(carnet.instrument), { score: carnet.seq, value: JSON.stringify(carnet) })
          transaction.xAdd(EVENTS, '*', { type: 'tick', instrument: carnet.instrument, seq: String(carnet.seq), data: JSON.stringify(carnet) })
        }
        if (await transaction.exec()) return bid
      } catch (error) {
        if (!(error instanceof WatchError)) throw error
      } finally {
        await this.redis.unwatch()
      }
    } })
  }

  bid(nouveau: NouveauBid): Promise<{ bid: Bid; created: boolean }> {
    return this.serialize(async () => { for (;;) {
      await this.redis.watch(STATE)
      try {
        const state = await this.read()
        const key = nouveau.requestId ? `${nouveau.userId}:${nouveau.requestId}` : null
        const existing = key && state.bidsParRequete.get(key)
        if (existing) return { bid: existing, created: false }
        const bid = ajouterBid(state, nouveau, true)
        const transaction = this.redis.multi().set(STATE, encode(state))
          .xAdd(EVENTS, '*', { type: 'bid', data: JSON.stringify(bid) })
          .zAdd(BIDS, { score: numeroBid(bid.id), value: JSON.stringify(bid) })
        if (await transaction.exec()) return { bid, created: true }
      } catch (error) {
        if (!(error instanceof WatchError)) throw error
      } finally {
        await this.redis.unwatch()
      }
    } })
  }

  async watch(sym: string, user: string, socketId: string) {
    await this.redis.zAdd(presence(sym), { score: Date.now() + 6_000, value: viewer(user, socketId) })
  }

  async leave(sym: string, user: string, socketId: string, grace = true) {
    if (grace) {
      await this.redis.zAdd(presence(sym), { score: Date.now() + 5_000, value: viewer(user, socketId) }, { XX: true })
    } else {
      await this.redis.zRem(presence(sym), viewer(user, socketId))
    }
  }

  async viewerCount(sym: string): Promise<number> {
    const now = Date.now()
    await this.redis.zRemRangeByScore(presence(sym), '-inf', now)
    const active = await this.redis.zRangeByScore(presence(sym), `(${now}`, '+inf')
    return new Set(active.map((entry) => (JSON.parse(entry) as [string, string])[0])).size
  }

  /** Bids numerotes apres `after` : le journal couvre tout l'historique. */
  async replayBids(after: number, count = 200): Promise<Bid[]> {
    const rows = await this.redis.zRangeByScore(BIDS, `(${after}`, '+inf', {
      LIMIT: { offset: 0, count },
    })
    return rows.map((row) => JSON.parse(row) as Bid)
  }

  async replay(sym: string, after: number, count = 100): Promise<CarnetOrdres[]> {
    const rows = await this.redis.zRangeByScore(prices(sym), `(${after}`, '+inf', {
      LIMIT: { offset: 0, count },
    })
    return rows.map((row) => JSON.parse(row) as CarnetOrdres)
  }
}

export async function connectMarket(url: string) {
  const redis = createClient({ url })
  redis.on('error', (error) => console.error('Redis market:', error))
  await redis.connect()
  const market = new RedisMarket(redis)
  await market.init()
  return market
}

function encode(store: Store) {
  return JSON.stringify({
    ...store,
    carnets: [...store.carnets],
    historique: [...store.historique],
    bidsEnAttente: [...store.bidsEnAttente],
    bidsParRequete: [...store.bidsParRequete],
  })
}

function decode(data: string): Store {
  const raw = JSON.parse(data)
  return {
    ...raw,
    carnets: new Map(raw.carnets),
    historique: new Map(raw.historique),
    bidsEnAttente: new Map(raw.bidsEnAttente),
    bidsParRequete: new Map(raw.bidsParRequete),
  }
}
