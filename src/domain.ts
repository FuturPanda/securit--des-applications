// Domaine : flux de cotations et carnet d'ordres par instrument. Pur, sans I/O.

export interface Niveau {
  prix: number
  quantite: number
}

export interface CarnetOrdres {
  instrument: string
  bids: Niveau[] // tries prix decroissant
  asks: Niveau[] // tries prix croissant
  dernierPrix: number
  seq: number // numero de sequence des mises a jour
}

export interface Instrument {
  symbole: string
  nom: string
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

/** Hash deterministe -> [0, 1). */
function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Generateur deterministe : fait osciller le prix autour de sa valeur (marche aleatoire bornee). */
export function tickSuivant(carnet: CarnetOrdres, graine: number): CarnetOrdres {
  const delta = (hash01(graine) - 0.5) * 0.5
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
