# ADR-2 : strategie de convergence des cotations

## Statut
Accepte (cours temps reel). Distinct de l'ADR-2 de priorisation d'audit du cours securite.

## Contexte
Un navigateur coupe du flux SSE pendant que le marche avance manque des cotations. Un simple
etat courant cache le trou : `npm run scenario` le reproduit ; deux navigateurs peuvent alors
sembler afficher des marches differents. Le serveur est l'autorite sur chaque carnet.

## Options envisagees
- OT et CRDT : inutiles pour un flux produit par un seul serveur, sans edition concurrente.
- Tick fixe seul : produit de nouveaux prix mais ne repare pas un trou chez un client.
- Throttle / smoothing : ameliore l'affichage, pas la coherence.
- Instantane + mises a jour numerotees : permet de rejouer un petit trou ou de converger
  directement sur l'etat courant quand il est trop grand.

## Decision
Chaque instrument porte une sequence croissante et un buffer borne aux 50 dernieres
mises a jour. Le client suit sa derniere sequence ; a la reconnexion SSE, `Last-Event-ID`
declenche le rejeu ordonne des mises a jour manquantes. Un identifiant perime ou invalide
provoque un nouvel instantane. Le serveur utilise `SequencedInstrument` fourni ; chaque
« delta » contient le carnet courant complet, pas un patch. Changer d'instrument ouvre
un autre flux avec son propre instantane et sa propre sequence.

## Consequences
Un trou court est observable et rejoue ; un trou long converge par instantane sans
reconstituer tous les ticks manques. Cout : jusqu'a 50 carnets par instrument en memoire,
et autant de messages SSE a rejouer. L'etat et les bids ne survivent pas au redemarrage
du serveur. Les rooms Socket.IO ne transportent pas les cotations : elles ne servent qu'a
la presence des spectateurs authentifies et aux commandes de bid.
