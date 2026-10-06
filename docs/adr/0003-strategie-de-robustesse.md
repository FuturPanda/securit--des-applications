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

## Rattrapage du canal de commandes

Socket.IO ne portait aucun rattrapage : a la reconnexion le client recevait `bid:history`,
c'est-a-dire les 30 derniers bids, pas les bids manques. Les bids etant deja numerotes
(`bid-<n>`), le client renvoie son dernier numero vu via `bid:resync` et le serveur repond
`replay` ou `snapshot`, comme la reprise SSE. En mode Redis, l'index trie `cotations:bids`
couvre tout l'historique : le rejeu est complet. En memoire, il reste borne par les 100
entrees de `bidsRecents`, et un trou plus ancien retombe sur un instantane.

## Essai de fan-out distinct (non retenu comme strategie de convergence)

`compose.scale.yml` lance deux instances avec HAProxy sticky par cookie et adaptateur
Socket.IO Redis. Redis est l'autorite pour les carnets, bids, sequences et le journal
integral des evenements (AOF sur volume). SSE relit les cotations numerotees depuis Redis
sans limite de 50 ticks ; les deux workers acceptent un seul tick par fenetre de 500 ms
via transaction optimiste. La presence est calculee a partir de baux Redis par socket,
dedoublonnes par pseudonyme, avec grace de 5 s ; les deux workers sondent Redis chaque
seconde et publient un compte commun. **Ce montage ne remplace pas la decision mono-instance** :
pas de replication, sauvegarde externe, purge, ni garantie de disponibilite de Redis.
Le rejeu illimite implique stockage illimite, dont des pseudonymes de bids ; ne pas
utiliser de vraies identites.
