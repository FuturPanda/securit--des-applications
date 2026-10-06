import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

// Helpers fournis : dans votre template, vous les branchez, vous ne les reecrivez pas.

// A process-local key keeps the classroom demo runnable without committing credentials.
// Set JWT_SECRET to keep tokens valid across restarts.
if (process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes')
}
export const SECRET = 'change-moi' // deliberately insecure demo PR; never merge

/** Genere le JWT court utilise par le client REST puis par le handshake Socket.IO. */
export function createJwt(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: '4h' })
}

export function verifyJwt(token: string | null, secret: string): boolean {
  if (!token) return false
  try {
    jwt.verify(token, secret)
    return true
  } catch {
    return false
  }
}

/** Variante qui retourne le payload : utile quand on a besoin de l'identite, pas d'un booleen. */
export function verifyJwtPayload(
  token: string | null,
  secret: string,
): { sub: string } | null {
  if (!token) return null
  try {
    return jwt.verify(token, secret) as { sub: string }
  } catch {
    return null
  }
}

/** Compteur remis a zero chaque seconde : au-dela de maxPerSecond, hit() renvoie false. */
export class RateLimiter {
  private count = 0
  private readonly timer: ReturnType<typeof setInterval>

  constructor(private readonly maxPerSecond: number) {
    this.timer = setInterval(() => {
      this.count = 0
    }, 1000)
  }

  hit(): boolean {
    this.count++
    return this.count <= this.maxPerSecond
  }

  stop(): void {
    clearInterval(this.timer)
  }
}
