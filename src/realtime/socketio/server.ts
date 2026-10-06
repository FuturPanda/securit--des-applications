import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import {
  RateLimiter,
  SECRET,
  verifyJwtPayload,
} from '../ws/security-helpers.ts'
import { isAllowedOrigin } from '../origin.ts'
import type { Bid } from '../../domain.ts'
import { ajouterBid, type Store } from '../../store.ts'
import type { RedisMarket } from '../redis-market.ts'

interface PlaceBidPayload {
  requestId: string
  instrument: string
  prix: number
  quantite: number
}

type PlaceBidAck =
  | { ok: true; bid: Bid }
  | { ok: false; error: string }

interface ServerToClientEvents {
  'auth:ready': (payload: { userId: string }) => void
  'bid:history': (bids: Bid[]) => void
  'bid:new': (bid: Bid) => void
  presence: (payload: { instrument: string; count: number }) => void
}

interface ClientToServerEvents {
  watch: (instrument: string, ack: (result: { ok: boolean }) => void) => void
  'bid:place': (
    payload: PlaceBidPayload,
    ack?: (result: PlaceBidAck) => void,
  ) => void
}

interface InterServerEvents {}

interface SocketData {
  userId: string
  watching?: string
}

export function startSocketIoServer(httpServer: HttpServer, store: Store, market?: RedisMarket) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: (origin, done) => done(null, isAllowedOrigin(origin)),
    },
    allowRequest: (request, done) => {
      done(
        null,
        isAllowedOrigin(request.headers.origin, request.headers.host)
      )
    },
  })

  const viewers = new Map<string, Set<string>>()
  const departures = new Map<string, ReturnType<typeof setTimeout>>()
  const room = (sym: string) => `instrument:${sym}`
  const key = (sym: string, user: string) => `${sym}:${user}`
  const announce = (sym: string) => io.to(room(sym)).emit('presence', {
    instrument: sym, count: viewers.get(sym)?.size ?? 0,
  })
  const stillWatching = (sym: string, user: string) =>
    [...io.of('/').sockets.values()].some((s) => s.data.watching === sym && s.data.userId === user)
  const remove = (sym: string, user: string) => {
    if (stillWatching(sym, user)) return
    viewers.get(sym)?.delete(user)
    announce(sym)
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    const payload = verifyJwtPayload(
      typeof token === 'string' ? token : null,
      SECRET,
    )

    if (!payload || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      next(new Error('Token invalide'))
      return
    }

    socket.data.userId = payload.sub
    next()
  })

  io.on('connection', (socket) => {
    const limiter = new RateLimiter(10)

    socket.emit('auth:ready', { userId: socket.data.userId })
    if (market) {
      void market.read().then((state) => socket.emit('bid:history', state.bidsRecents.slice(-30)))
        .catch((error) => { console.error('Redis bid history:', error); socket.disconnect(true) })
    } else socket.emit('bid:history', store.bidsRecents.slice(-30))

    socket.on('watch', (raw, ack) => {
      const sym = typeof raw === 'string' ? raw.toUpperCase() : ''
      if (!store.carnets.has(sym) || !limiter.hit()) {
        ack?.({ ok: false })
        return
      }
      const previous = socket.data.watching
      if (previous && previous !== sym) {
        socket.leave(room(previous))
        socket.data.watching = undefined
        remove(previous, socket.data.userId)
      }
      socket.join(room(sym))
      socket.data.watching = sym
      const pending = key(sym, socket.data.userId)
      clearTimeout(departures.get(pending))
      departures.delete(pending)
      const group = viewers.get(sym) ?? new Set<string>()
      group.add(socket.data.userId)
      viewers.set(sym, group)
      ack?.({ ok: true })
      announce(sym)
    })

    socket.on('bid:place', async (payload, ack) => {
      if (!limiter.hit()) {
        ack?.({ ok: false, error: 'Trop de messages' })
        socket.disconnect(true)
        return
      }

      const validation = validerBid(payload, store)
      if (!validation.ok) {
        ack?.({ ok: false, error: validation.error })
        return
      }

      const nouveau = {
        requestId: payload.requestId,
        instrument: validation.instrument,
        userId: socket.data.userId,
        prix: payload.prix,
        quantite: payload.quantite,
        source: 'socket' as const,
      }
      try {
        const existing = store.bidsParRequete.has(`${socket.data.userId}:${payload.requestId}`)
        const { bid, created } = market
          ? await market.bid(nouveau)
          : { bid: ajouterBid(store, nouveau), created: !existing }
        ack?.({ ok: true, bid })
        if (created) io.emit('bid:new', bid)
      } catch (error) {
        console.error('Bid persistence:', error)
        ack?.({ ok: false, error: 'Stockage indisponible' })
      }
    })

    socket.on('disconnect', () => {
      limiter.stop()
      const sym = socket.data.watching
      if (!sym || stillWatching(sym, socket.data.userId)) return
      const pending = key(sym, socket.data.userId)
      clearTimeout(departures.get(pending))
      departures.set(pending, setTimeout(() => {
        departures.delete(pending)
        remove(sym, socket.data.userId)
      }, 5_000))
    })
  })

  httpServer.on('close', () => {
    for (const timer of departures.values()) clearTimeout(timer)
  })
  return io
}

export async function attachRedisAdapter(io: ReturnType<typeof startSocketIoServer>, url: string) {
  const pub = createClient({ url })
  const sub = pub.duplicate()
  pub.on('error', (error) => console.error('Redis publisher:', error))
  sub.on('error', (error) => console.error('Redis subscriber:', error))
  try {
    await Promise.all([pub.connect(), sub.connect()])
  } catch (error) {
    pub.destroy()
    sub.destroy()
    throw error
  }
  io.adapter(createAdapter(pub, sub, { key: 'cotations-marche' }))
  return async () => { await Promise.all([pub.quit(), sub.quit()]) }
}

function validerBid(
  payload: PlaceBidPayload,
  store: Store,
): { ok: true; instrument: string } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Bid invalide' }
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.length > 100) {
    return { ok: false, error: 'requestId invalide' }
  }

  const instrument = typeof payload.instrument === 'string'
    ? payload.instrument.toUpperCase()
    : ''
  if (!store.carnets.has(instrument)) {
    return { ok: false, error: 'Instrument inconnu' }
  }
  if (!Number.isFinite(payload.prix) || payload.prix <= 0 || payload.prix > 1_000_000) {
    return { ok: false, error: 'Prix invalide' }
  }
  if (
    !Number.isSafeInteger(payload.quantite) ||
    payload.quantite <= 0 ||
    payload.quantite > 1_000_000
  ) {
    return { ok: false, error: 'Quantite invalide' }
  }

  return { ok: true, instrument }
}
