import { creerCarnet, tickSuivant, type CarnetOrdres, type Instrument } from './domain.ts'

export const INSTRUMENTS: Instrument[] = [
  { symbole: 'ACME', nom: 'Acme Corp' },
  { symbole: 'GLOB', nom: 'Globex' },
  { symbole: 'INIT', nom: 'Initech' },
  { symbole: 'UMBR', nom: 'Umbrella' },
]

const PRIX_INITIAL: Record<string, number> = { ACME: 42, GLOB: 128.5, INIT: 17.2, UMBR: 300 }

/** 200 ticks rejouables par instrument (deterministe). */
export function buildSeed(): {
  carnets: Map<string, CarnetOrdres>
  historique: Map<string, CarnetOrdres[]>
} {
  const carnets = new Map<string, CarnetOrdres>()
  const historique = new Map<string, CarnetOrdres[]>()
  for (const inst of INSTRUMENTS) {
    let carnet = creerCarnet(inst.symbole, PRIX_INITIAL[inst.symbole])
    const hist: CarnetOrdres[] = [structuredClone(carnet)]
    for (let i = 1; i <= 200; i++) {
      carnet = tickSuivant(carnet, i + inst.symbole.charCodeAt(0))
      hist.push(structuredClone(carnet))
    }
    carnets.set(inst.symbole, carnet)
    historique.set(inst.symbole, hist)
  }
  return { carnets, historique }
}

if (process.argv.includes('--print')) {
  const { carnets } = buildSeed()
  for (const c of carnets.values()) {
    console.log(`${c.instrument}: dernier ${c.dernierPrix} (seq ${c.seq}) bid ${c.bids[0].prix} / ask ${c.asks[0].prix}`)
  }
}
