import { buildSeed, INSTRUMENTS } from './seed.ts'
import { tickSuivant, type CarnetOrdres } from './domain.ts'

// Le stub diffuse le carnet COMPLET de TOUS les instruments a TOUS les clients, a chaque tick,
// sans tenir compte des abonnements. Aucun numero de sequence exploite a la reconnexion.

export interface Store {
  carnets: Map<string, CarnetOrdres>
  historique: Map<string, CarnetOrdres[]>
  instruments: typeof INSTRUMENTS
  graine: number
}

export function createStore(): Store {
  const { carnets, historique } = buildSeed()
  return { carnets, historique, instruments: INSTRUMENTS, graine: 1000 }
}

/** Fait avancer tous les carnets d'un tick. Appele par le stub sur un intervalle. */
export function avancer(store: Store): void {
  store.graine++
  for (const [sym, carnet] of store.carnets) {
    store.carnets.set(sym, tickSuivant(carnet, store.graine + sym.charCodeAt(0)))
  }
}

export interface ClientMessage {
  kind: 'subscribe' | 'unsubscribe'
  instrument: string
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.kind !== 'subscribe' && o.kind !== 'unsubscribe') return null
  if (typeof o.instrument !== 'string') return null
  return { kind: o.kind, instrument: o.instrument }
}
