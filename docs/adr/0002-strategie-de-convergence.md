# ADR-2 : strategie de convergence

## Statut
A definir (accepte etape 6)

## Contexte
<Le scenario de concurrence de ce projet (voir src/realtime/piege.scenario.ts) et ce qui diverge
sans strategie.>

## Options envisagees
- OT (operational transformation)
- CRDT
- snapshot + delta numerote
- boucle serveur autoritaire a tick fixe
- throttle / smoothing

## Decision
<La strategie retenue, et pourquoi elle est la bonne ici et pas une autre.>

## Consequences
<Cout memoire / bande passante, ce que ca simplifie, cas non couverts.>
