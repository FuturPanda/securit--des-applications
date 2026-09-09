import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import {
  RateLimiter,
  SECRET,
  verifyJwtPayload,
} from '../ws/security-helpers.ts'
import { isAllowedOrigin } from '../origin.ts'
import type { Bid } from '../../domain.ts'
import { ajouterBid, type Store } from '../../store.ts'

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
}

interface ClientToServerEvents {
  'bid:place': (
    payload: PlaceBidPayload,
    ack?: (result: PlaceBidAck) => void,
  ) => void
}

interface InterServerEvents {}

interface SocketData {
  userId: string
}

export function startSocketIoServer(httpServer: HttpServer, store: Store) {
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
    socket.emit('bid:history', store.bidsRecents.slice(-30))

    socket.on('bid:place', (payload, ack) => {
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

      const cleRequete = `${socket.data.userId}:${payload.requestId}`
      const dejaTraite = store.bidsParRequete.has(cleRequete)
      const bid = ajouterBid(store, {
        requestId: payload.requestId,
        instrument: validation.instrument,
        userId: socket.data.userId,
        prix: payload.prix,
        quantite: payload.quantite,
        source: 'socket',
      })

      ack?.({ ok: true, bid })
      if (!dejaTraite) io.emit('bid:new', bid)
    })

    socket.on('disconnect', () => limiter.stop())
  })

  return io
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
