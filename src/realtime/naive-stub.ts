import { WebSocketServer, type WebSocket } from 'ws'
import type { Server } from 'node:http'

// ============================================================================
//  LE STUB TEMPS REEL NAIF - a remplacer, une tranche a la fois (voir TRANSPOSITION.md).
// ============================================================================
//  Defauts VOLONTAIRES (chaque etape en corrige un) :
//   - un seul WebSocketServer global : pas de room, tout le monde voit tout        (etape 4)
//   - setInterval rediffuse l'ETAT COMPLET a tous, qu'il ait change ou non         (etapes 2, 5)
//   - onmessage applique l'entree cliente telle quelle : aucune validation,
//     aucune autorisation, dernier ecrivain gagne                                  (etapes 3, 6)
//   - rien a la reconnexion : le client qui revient a perdu l'intervalle           (etapes 2, 6)
//   - instance unique : ne passe pas a l'echelle                                   (etape 7)
//   - pas de presence, pas de signal ephemere                                      (etape 5)
// ============================================================================

export interface NaiveHooks<TInput> {
  /** L'etat complet a diffuser (serialise en JSON tel quel). */
  fullState(): unknown
  /** Valide/parse un message client ; renvoie null pour ignorer. */
  parseInput(raw: unknown): TInput | null
  /** Applique l'entree cliente. Aucune garantie d'ordre ni de convergence. */
  applyInput(input: TInput): void
}

export function startNaiveStub<TInput>(httpServer: Server, hooks: NaiveHooks<TInput>) {
  const wss = new WebSocketServer({ server: httpServer })
  const clients = new Set<WebSocket>()

  const snapshot = () => JSON.stringify({ type: 'state', state: hooks.fullState() })

  wss.on('connection', (socket) => {
    clients.add(socket)
    socket.send(snapshot()) // le seul "rattrapage" : un etat complet, sans historique
    socket.on('message', (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        return
      }
      const input = hooks.parseInput(parsed)
      if (input) hooks.applyInput(input)
    })
    socket.on('close', () => clients.delete(socket))
  })

  // Diffusion "brute force" : tout l'etat, a tout le monde, deux fois par seconde.
  const timer = setInterval(() => {
    const msg = snapshot()
    for (const c of clients) if (c.readyState === c.OPEN) c.send(msg)
  }, 500)

  wss.on('close', () => clearInterval(timer))
  return wss
}
