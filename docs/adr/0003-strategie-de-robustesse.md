# ADR-3 : strategie de robustesse

## Statut
Accepte (cours temps reel).

## Contexte
Apres une coupure reseau de 5 s, le serveur continue de produire environ dix cotations
par instrument, alors que le navigateur n'en recoit aucune. La presence d'un utilisateur
authentifie ne doit pas clignoter pour une courte reconnexion.

## Options envisagees
- Reconnexion + resynchronisation par rejeu ou instantane : repond directement a la perte
  temporaire du flux, sans infrastructure supplementaire.
- Redis et plusieurs instances : utiles au fan-out horizontal, mais ne rendent pas les
  bids durables et ajoutent une dependance inutile a la demonstration locale.

## Decision
Conserver une seule instance. `EventSource` reconnecte et presente le dernier identifiant
recu ; le serveur rejoue jusqu'a 50 mises a jour ou renvoie un instantane. Les rooms
Socket.IO conservent la presence d'un spectateur authentifie pendant 5 s apres une coupure,
a condition qu'il revienne avec la meme identite sur le meme instrument.

## Consequences
Une coupure courte est rattrapable en direct avec deux navigateurs. Les depassements du
buffer convergent vers le dernier etat, sans preuve que chaque tick a ete affiche. Un
redemarrage remet a zero l'etat et les buffers en memoire : cette solution ne garantit
ni persistance des bids, ni haute disponibilite bancaire.

## Essai de fan-out distinct (non retenu comme strategie de convergence)

`compose.scale.yml` lance deux instances avec HAProxy sticky par cookie et adaptateur
Socket.IO Redis : les evenements `bid:new` passent entre instances. **Ce montage ne
remplace pas la decision mono-instance** : carnet, simulation, idempotence, buffers SSE
et presence restent locaux et peuvent diverger. Il faut partager ou centraliser ces
etats avant de qualifier le montage de mise a l'echelle du marche.
