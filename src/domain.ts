export interface Niveau {
  prix: number
  quantite: number
}

export interface CarnetOrdres {
  instrument: string
  bids: Niveau[] 
  asks: Niveau[] 
  dernierPrix: number
  seq: number 
}

export interface Instrument {
  symbole: string
  nom: string
}

export interface Bid {
  id: string
  requestId?: string
  instrument: string
  userId: string
  prix: number
  quantite: number
  source: 'simulation' | 'socket'
  creeA: number
}

export function creerCarnet(instrument: string, prixInitial: number): CarnetOrdres {
  return {
    instrument,
    bids: [
      { prix: prixInitial - 0.2, quantite: 100 },
      { prix: prixInitial - 0.5, quantite: 250 },
    ],
    asks: [
      { prix: prixInitial + 0.2, quantite: 120 },
      { prix: prixInitial + 0.5, quantite: 300 },
    ],
    dernierPrix: prixInitial,
    seq: 0,
  }
}

function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

export function tickSuivant(
  carnet: CarnetOrdres,
  graine: number,
  impactBids = 0,
): CarnetOrdres {
  const impactBorne = Math.max(0, Math.min(0.4, impactBids))
  const delta = (hash01(graine) - 0.5) * 0.5 + impactBorne
  const prix = Math.max(1, Number((carnet.dernierPrix + delta).toFixed(2)))
  return {
    ...carnet,
    dernierPrix: prix,
    seq: carnet.seq + 1,
    bids: [
      { prix: Number((prix - 0.2).toFixed(2)), quantite: 80 + ((graine * 7) % 200) },
      { prix: Number((prix - 0.5).toFixed(2)), quantite: 200 + ((graine * 13) % 300) },
    ],
    asks: [
      { prix: Number((prix + 0.2).toFixed(2)), quantite: 90 + ((graine * 11) % 200) },
      { prix: Number((prix + 0.5).toFixed(2)), quantite: 220 + ((graine * 17) % 300) },
    ],
  }
}
