# Cotations marche / carnet d'ordres

Un flux de prix haute frequence pour plusieurs instruments : carnet d'ordres (bids / asks),
abonnement du client par instrument, graphe temps reel, resynchronisation apres coupure.

## Demarrer

Le secret JWT est aléatoire à chaque démarrage (les anciens tokens expirent au redémarrage).
Pour conserver les tokens entre redémarrages, définir `JWT_SECRET` hors du dépôt.
Le token REST reste une **identité de démonstration choisie librement**, pas une authentification bancaire.

```bash
docker compose up --build   # app + Redis sur http://localhost:3009
```

Le Compose par défaut démarre une instance et Redis avec un volume persistant : rejeu
complet des cotations SSE **et** des bids après une coupure Socket.IO. Il génère un
`JWT_SECRET` aléatoire au démarrage si la variable est absente ; les anciens tokens ne
survivent pas au redémarrage de l'app. Pour conserver les tokens, définir `JWT_SECRET`
hors du dépôt. Ne pas lancer `docker compose down -v` si l'on veut garder le journal.

Sans Docker : `npm install && npm start` lance le mode mémoire (50 cotations par
instrument, 100 bids récents). Pour brancher l'app sur un Redis local déjà lancé :

```bash
npm run start:redis            # REDIS_URL=redis://127.0.0.1:6379 par défaut
```

Le script exige un `JWT_SECRET` ; il en génère un aléatoire si la variable est absente.
Pour repartir d'un marché vierge : `redis-cli --scan --pattern 'cotations:*' | xargs redis-cli del`.

## Essai local à deux instances avec journal Redis persistant

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
docker compose -f compose.scale.yml up --build
# autre terminal, macOS + Safari : deux onglets épinglés aux workers a et b
mise run demo:two-workers
```

HAProxy épingle `localhost:3009` à app-a et `127.0.0.1:3009` à app-b :
chaque onglet garde son worker pour toutes les requêtes Engine.IO (polling et WebSocket).
Les deux origines isolent aussi leurs cookies et leur `sessionStorage` (identités de
démo distinctes). La tâche vérifie l'en-tête `X-Demo-Worker` des deux réponses
**avant** d'ouvrir Safari. Les autres noms d'hôte conservent le routage sticky par cookie. Les deux
instances partagent la clé JWT ; Redis conserve l'état canonique du marché et des bids,
un journal `cotations:events` (ticks et bids), et tous les carnets numérotés par instrument
pour le rejeu SSE (`cotations:prices:<sym>`). Les mises à jour concurrentes passent par
`WATCH`/`MULTI` ; un seul tick est accepté par tranche de 500 ms. `from=0` ou
`Last-Event-ID: 0` rejoue toutes les cotations **générées depuis la création du volume** ;
sans curseur, SSE commence par l'instantané courant. Le client Socket.IO garde un
historique d'affichage de 30 bids, mais le journal Redis conserve tous les bids.

Redis utilise un volume Docker, AOF `appendfsync always` et `noeviction` : le journal
survit au redémarrage des conteneurs et n'est jamais taillé par l'application. Test :
`npx tsx scripts/scale-smoke.ts` puis `npx tsx scripts/redis-replay-smoke.ts` ;
pour voir les événements bruts :
`docker compose -f compose.scale.yml exec redis redis-cli XRANGE cotations:events - + COUNT 10`.
**Ne pas utiliser `down -v`** si l'on veut garder le journal.

La présence est partagée par des baux Redis par socket/instrument : chaque worker
compte les **pseudonymes uniques** encore valides et diffuse le résultat aux deux
workers. Le bail est renouvelé chaque seconde, expire six secondes après le dernier
renouvellement en cas de crash, ou cinq secondes après une déconnexion normale.
`npx tsx scripts/presence-smoke.ts` vérifie deux workers, plusieurs onglets du même
pseudonyme et la grâce. Le journal permanent concerne ticks et bids, **pas** la présence.

**Limites** : croissance disque sans limite (et échec des écritures si disque plein),
pas de réplication Redis/sauvegarde hors du volume, pas de garantie contre une panne
de disque ou la perte du volume. La présence est éventuellement cohérente (sondage
chaque seconde), pas instantanée ni résistante à une panne de Redis. Les pseudonymes
des bids sont conservés sans durée de purge ; ne pas utiliser de vraies identités.
Le mode mono-instance avec Redis (`docker compose up --build`) reste la démo de référence ;
`compose.scale.yml` est l'expérience à deux workers.

## API REST

| Methode | Route | Description |
|---|---|---|
| GET | `/api/instruments` | liste des instruments |
| POST | `/api/auth/token` | genere un JWT de demonstration depuis un nom utilisateur |
| GET | `/api/bids` | 30 derniers bids simules ou recus par Socket.IO |
| GET | `/api/instruments/:sym/book` | carnet courant d'un instrument |
| GET | `/api/instruments/:sym/history?from=<seq>` | historique des prix depuis un numero de sequence |
| GET | `/api/stream?instrument=ACME` | SSE filtre par instrument ; `Last-Event-ID` permet le rejeu |

Donnees de demonstration : `npm run seed` (4 instruments, 200 ticks rejouables par instrument).

## Bids temps reel

Un utilisateur authentifie peut emettre `bid:place` par Socket.IO avec un `requestId`, un
instrument, un prix et une quantite. Le serveur acquitte la commande, la deduplique puis diffuse
`bid:new`. Un utilisateur simule cree egalement un bid toutes les 30 secondes, tandis que le
marche continue d'avancer toutes les 500 ms.

Les bids agressifs ajoutent une pression haussiere bornee au tick suivant. Socket.IO permet de voir chaque nouveau bid immediatement. Ses rooms `instrument:<symbole>`
representent les spectateurs authentifies ; la presence garde un delai de grace de 5 secondes.

### Rattrapage apres une coupure Socket.IO

A la reconnexion, le client renvoie le numero du dernier bid vu avec `bid:resync` et le
serveur repond avec le meme vocabulaire que la reprise SSE :

- **`replay`** : les bids manques sont renvoyes dans l'ordre. Avec Redis le journal couvre
  tout l'historique, donc bien au-dela des 30 bids de `bid:history`.
- **`snapshot`** : sans Redis, `bidsRecents` est borne a 100 entrees ; un trou plus ancien
  n'est plus rejouable et le serveur renvoie les 30 derniers bids.

L'interface affiche le delta recu sous les boutons de demonstration : combien de bids ont
ete rejoues et lesquels. Verification :
`npx tsx src/realtime/bid-resync.test.ts` (les deux modes) et, contre un serveur lance,
`npx tsx scripts/bid-resync-smoke.ts`.

## Etat de la couche temps reel

Les cotations passent par SSE (un instrument par connexion), les offres et la presence par
Socket.IO. Avec Docker Compose et Redis, SSE rejoue toutes les cotations manquées depuis le
numéro reçu, même après redémarrage de l'app. Sans Redis (`npm start`), le buffer est borné
à 50 cotations par instrument : un trou plus ancien reçoit un instantané et le buffer est
perdu au redémarrage. Le bouton « Couper le flux SSE 3 s » permet une démonstration à deux
navigateurs. Vérification du flux et des rooms :
`npx tsx src/realtime/recovery.test.ts`. `npm run scenario -- --avec-strategie` illustre
la convergence ; `src/realtime/naive-stub.ts` est conserve pour comparaison historique.

Demo : `docker compose up --build`, ouvrir `http://localhost:3009` dans deux navigateurs, selectionner ACME
sur chacun et noter leurs sequences. Generer un JWT pour chaque navigateur puis se connecter :
la presence passe a 2. Cliquer « Couper le flux SSE 3 s » dans un navigateur : l'autre
continue ; au retour, la liste « Cotations rejouées » affiche chaque sequence manquee
et son prix, puis les deux sequences convergent.
Changer l'instrument dans un onglet : la presence de la room ACME passe a 1.
Le test automatisé couvre aussi le mode mémoire : au-delà de 50 ticks, il vérifie
le retour par instantané sans attendre 26 secondes pendant la soutenance.

## Soutenance

[Conducteur chronométré (15 min), pré-vol et Q&A](docs/presentation/soutenance.md).

## Sécurité

Le [modèle de menace DFD/STRIDE](docs/security/threat-model.md), les [événements redoutés EBIOS](docs/security/ebios-rm.md), le [rapport d'audit](docs/security/rapport-audit.md),
l'[ADR-2 sécurité](docs/security/ADR-2-priorisation-audit.md) et le [pipeline à huit jobs](docs/security/pipeline.md)
décrivent les risques, les preuves, les décisions et les runs vert/rouge de la démonstration.
Le [registre des traitements](docs/security/registre-traitements.md) et la
[checklist SSI](docs/security/doc-ssi-checklist.md) indiquent ce qui est réellement livré
et les points de conformité encore ouverts.

## Structure

```
src/domain.ts              instruments, carnet, generateur de ticks deterministe (pur)
src/store.ts               etat en memoire + avancee du marche
src/rest.ts                routes Fastify
src/server.ts              point d'entree
src/seed.ts                donnees de demonstration
src/realtime/naive-stub.ts       ancien stub, conserve pour comparaison
src/realtime/ws/security-helpers.ts  JWT + RateLimiter (clé aléatoire par processus ou JWT_SECRET)
src/realtime/convergence.exemple.ts  strategie de convergence adaptee (fourni, a brancher)
src/realtime/piege.scenario.ts   scenario pedagogique de coupure et reprise
public/index.html          front de demonstration
docs/adr/                  vos Architecture Decision Records
```
