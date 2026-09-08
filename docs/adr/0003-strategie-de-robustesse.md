# ADR-3 : strategie de robustesse

## Statut
A definir (recommande etape 7, accepte etape 9)

## Contexte
<Que se passe-t-il, dans ce projet, apres une coupure reseau de 5 s ?>

## Options envisagees
- reconnexion + resynchronisation (rejeu du delta ou snapshot)
- fan-out multi-instances via Redis

## Decision
<L'element de robustesse principal du projet, et pourquoi.>

## Consequences
<Ce que ca coute, ce que ca ne couvre pas.>
