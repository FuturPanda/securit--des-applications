// STRATEGIE DE CONVERGENCE (exemple fourni, adapte a ce projet).
//
// Snapshot + delta numerote. Le serveur fait autorite ; chaque mise a jour d'un carnet porte un
// numero de sequence croissant. A la reconnexion, le client envoie son dernier seq connu :
//   - petit trou  -> le serveur rejoue les deltas manquants
//   - grand trou (buffer depasse) -> le serveur renvoie un snapshot complet
//
// Pour l'activer (etape 6) : dans src/server.ts, au lieu de rediffuser tout l'etat, poussez les
// deltas de `SequencedInstrument` a la room `instrument:<symbole>`, et repondez a un message
// `resync {lastSeq}` du client. Vous NE reecrivez pas ce fichier.

import type { CarnetOrdres } from '../domain.ts'

export interface Delta {
  seq: number
  carnet: CarnetOrdres
}

export class SequencedInstrument {
  private seq = 0
  private courant: CarnetOrdres
  private readonly recent: Delta[] = []
  private readonly MAX_RECENT = 50

  constructor(initial: CarnetOrdres) {
    this.courant = { ...initial, seq: 0 }
  }

  /** Nouvelle version du carnet -> delta numerote a diffuser. */
  push(carnet: CarnetOrdres): Delta {
    this.seq++
    this.courant = { ...carnet, seq: this.seq }
    const delta: Delta = { seq: this.seq, carnet: this.courant }
    this.recent.push(delta)
    if (this.recent.length > this.MAX_RECENT) this.recent.shift()
    return delta
  }

  /** Reponse a `resync {lastSeq}` d'un client. */
  resync(lastSeq: number):
    | { type: 'snapshot'; carnet: CarnetOrdres }
    | { type: 'deltas'; deltas: Delta[] } {
    const oldest = this.recent[0]?.seq ?? this.seq + 1
    if (lastSeq < oldest - 1) return { type: 'snapshot', carnet: this.courant }
    return { type: 'deltas', deltas: this.recent.filter((d) => d.seq > lastSeq) }
  }

  get seqCourant() {
    return this.seq
  }
}

/** Cote client : applique snapshot ou deltas, garde `lastSeq`. */
export class InstrumentClient {
  carnet: CarnetOrdres | null = null
  lastSeq = 0

  applyResync(r: ReturnType<SequencedInstrument['resync']>): void {
    if (r.type === 'snapshot') {
      this.carnet = r.carnet
      this.lastSeq = r.carnet.seq
    } else {
      for (const d of r.deltas) {
        this.carnet = d.carnet
        this.lastSeq = d.seq
      }
    }
  }

  applyDelta(d: Delta): void {
    if (d.seq <= this.lastSeq) return // deja vu / en retard
    this.carnet = d.carnet
    this.lastSeq = d.seq
  }
}
