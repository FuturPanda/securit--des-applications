import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage, Server } from 'node:http'
import { verifyJwt, RateLimiter, SECRET } from './security-helpers.ts'

// Serveur ws bas niveau : la bibliotheque gere le handshake HTTP Upgrade et le framing des
// messages (ce qu'on faisait a la main dans la tranche `s1`). On ajoute : securite au handshake + keepalive.

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:9001']

export function startWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (
      info: { origin: string; req: IncomingMessage },
      done: (ok: boolean, code?: number, msg?: string) => void,
    ) => {
      // wscat n'envoie pas d'Origin : on ne rejette que si une Origin explicite est interdite.
      if (info.origin && !isAllowedOrigin(info.origin, info.req)) {
        return done(false, 403, 'Origin non autorisee')
      }
      const token = new URL(info.req.url ?? '', 'http://x').searchParams.get('token')
      if (!verifyJwt(token, SECRET)) return done(false, 401, 'Token invalide')
      done(true)
    },
  })

  const limiters = new WeakMap<WebSocket, RateLimiter>()
  const alive = new WeakMap<WebSocket, boolean>()

  wss.on('connection', (socket) => {
    const limiter = new RateLimiter(20) // 20 messages/s max par connexion
    limiters.set(socket, limiter)
    alive.set(socket, true)

    socket.on('pong', () => alive.set(socket, true))
    socket.on('close', () => limiter.stop())

    socket.on('message', (data) => {
      if (!limiter.hit()) {
        socket.close(1008, 'rate limit exceeded')
        return
      }
      socket.send(`echo: ${data}`)
    })
  })

  // Keepalive : on ping toutes les 30 s, on termine les connexions qui ne repondent plus.
  const keepalive = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate()
        continue
      }
      alive.set(socket, false)
      socket.ping()
    }
  }, 30_000)

  wss.on('close', () => clearInterval(keepalive))
  return wss
}

function isAllowedOrigin(origin: string, request: IncomingMessage): boolean {
  const sameOrigin = request.headers.host && origin === `http://${request.headers.host}`
  return Boolean(sameOrigin || ALLOWED_ORIGINS.includes(origin))
}
