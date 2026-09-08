import jwt from 'jsonwebtoken'

// Helpers fournis : dans votre template, vous les branchez, vous ne les reecrivez pas.

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

export const SECRET = 'change-moi' // en production : variable d'environnement
