import { creerCarnet, tickSuivant } from '../domain.ts'
import { SequencedInstrument, InstrumentClient } from './convergence.exemple.ts'

// LE PIEGE de ce sujet : resynchronisation apres coupure.
//
//   npm run scenario                     -> STUB : le client se reconnecte sur un trou (sortie != 0)
//   npm run scenario -- --avec-strategie  -> snapshot + delta : le trou est comble (sortie 0)

const avecStrategie = process.argv.includes('--avec-strategie')

if (!avecStrategie) {
  let serveur = creerCarnet('ACME', 42)
  const recus: number[] = []
  for (let i = 1; i <= 2; i++) {
    serveur = tickSuivant(serveur, i)
    recus.push(serveur.seq)
  }
  const seqAvantCoupure = serveur.seq
  for (let i = 3; i <= 7; i++) serveur = tickSuivant(serveur, i) // COUPURE : 5 ticks
  recus.push(serveur.seq) // reconnexion : le stub renvoie juste l'etat courant

  const trou = serveur.seq - seqAvantCoupure - 1
  console.log(`seq recus par le client : ${recus.join(', ')}`)
  console.log(`seq manquants : ${trou}`)
  console.log(trou > 0 ? '\nTROU NON COMBLE  <- le stub ne rejoue pas les mises a jour manquees' : '\nOK')
  process.exit(trou > 0 ? 1 : 0)
} else {
  const serveur = new SequencedInstrument(creerCarnet('ACME', 42))
  const client = new InstrumentClient()

  let carnet = creerCarnet('ACME', 42)
  for (let i = 1; i <= 2; i++) {
    carnet = tickSuivant(carnet, i)
    client.applyDelta(serveur.push(carnet)) // client connecte : recoit seq 1, 2
  }
  // COUPURE : 5 ticks emis, le client ne les recoit pas
  for (let i = 3; i <= 7; i++) {
    carnet = tickSuivant(carnet, i)
    serveur.push(carnet)
  }
  // RECONNEXION : le client demande resync depuis son lastSeq
  client.applyResync(serveur.resync(client.lastSeq))

  console.log(`lastSeq client apres resync : ${client.lastSeq}`)
  console.log(`seq serveur                 : ${serveur.seqCourant}`)
  const ok = client.lastSeq === serveur.seqCourant
  console.log(ok ? '\nCONVERGE  (snapshot + delta)' : '\nDIVERGE')
  process.exit(ok ? 0 : 1)
}
