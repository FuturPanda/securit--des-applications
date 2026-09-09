import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import {
  SECRET,
  verifyJwtPayload,
} from '../ws/security-helpers.ts'

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:9001',
])

interface ServerToClientEvents {
  'auth:ready': (payload: { userId: string }) => void
}

interface ClientToServerEvents {}

interface InterServerEvents {}

interface SocketData {
  userId: string
}

export function startSocketIoServer(httpServer: HttpServer) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
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
    socket.emit('auth:ready', { userId: socket.data.userId })
  })

  return io
}

function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) return true

  const sameOrigin = host !== undefined && origin === `http://${host}`
  return sameOrigin || ALLOWED_ORIGINS.has(origin)
}
