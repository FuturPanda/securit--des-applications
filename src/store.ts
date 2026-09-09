import { buildSeed, INSTRUMENTS } from './seed.ts'
import { tickSuivant, type Bid, type CarnetOrdres } from './domain.ts'

// Le stub diffuse le carnet COMPLET de TOUS les instruments a TOUS les clients, a chaque tick,
// sans tenir compte des abonnements. Aucun numero de sequence exploite a la reconnexion.

export interface Store {
  carnets: Map<string, CarnetOrdres>
  historique: Map<string, CarnetOrdres[]>
  instruments: typeof INSTRUMENTS
  graine: number
  bidsRecents: Bid[]
  bidsEnAttente: Map<string, Bid[]>
  bidsParRequete: Map<string, Bid>
  prochainBidId: number
}

export function createStore(): Store {
  const { carnets, historique } = buildSeed()
  return {
    carnets,
    historique,
    instruments: INSTRUMENTS,
    graine: 1000,
    bidsRecents: [],
    bidsEnAttente: new Map(),
    bidsParRequete: new Map(),
    prochainBidId: 1,
  }
}

const UTILISATEURS_SIMULES = ['Ada', 'Linus', 'Grace', 'Margaret', 'Alan']
const MAX_BIDS_RECENTS = 100
const MAX_REQUETES_MEMORISEES = 1_000

export interface NouveauBid {
  requestId?: string
  instrument: string
  userId: string
  prix: number
  quantite: number
  source: Bid['source']
}

export function ajouterBid(store: Store, nouveau: NouveauBid): Bid {
  const cleRequete = nouveau.requestId
    ? `${nouveau.userId}:${nouveau.requestId}`
    : null
  const dejaTraite = cleRequete ? store.bidsParRequete.get(cleRequete) : null
  if (dejaTraite) return dejaTraite

  const bid: Bid = {
    ...nouveau,
    id: `bid-${store.prochainBidId++}`,
    creeA: Date.now(),
  }

  store.bidsRecents.push(bid)
  if (store.bidsRecents.length > MAX_BIDS_RECENTS) store.bidsRecents.shift()

  const enAttente = store.bidsEnAttente.get(bid.instrument) ?? []
  enAttente.push(bid)
  store.bidsEnAttente.set(bid.instrument, enAttente)

  if (cleRequete) {
    store.bidsParRequete.set(cleRequete, bid)
    if (store.bidsParRequete.size > MAX_REQUETES_MEMORISEES) {
      const premiereCle = store.bidsParRequete.keys().next().value
      if (premiereCle !== undefined) store.bidsParRequete.delete(premiereCle)
    }
  }

  return bid
}

/** Avance le marche de 500 ms et retourne le bid simule cree pendant ce tick. */
export function avancer(store: Store): Bid {
  store.graine++

  const instrument = store.instruments[store.graine % store.instruments.length]
  const carnet = store.carnets.get(instrument.symbole)!
  const decalagePrix = ((store.graine * 17) % 11 - 3) / 10
  const bidSimule = ajouterBid(store, {
    instrument: instrument.symbole,
    userId: UTILISATEURS_SIMULES[store.graine % UTILISATEURS_SIMULES.length],
    prix: Number((carnet.dernierPrix + decalagePrix).toFixed(2)),
    quantite: 25 + ((store.graine * 29) % 276),
    source: 'simulation',
  })

  for (const [sym, carnet] of store.carnets) {
    const bids = store.bidsEnAttente.get(sym) ?? []
    const impact = calculerImpactBids(carnet, bids)
    store.carnets.set(
      sym,
      tickSuivant(carnet, store.graine + sym.charCodeAt(0), impact),
    )
  }
  store.bidsEnAttente.clear()

  return bidSimule
}

function calculerImpactBids(carnet: CarnetOrdres, bids: Bid[]): number {
  return bids.reduce((impact, bid) => {
    const agressivite = Math.max(0, bid.prix - carnet.dernierPrix)
    const facteurVolume = Math.min(1, bid.quantite / 300)
    return impact + agressivite * facteurVolume
  }, 0)
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
