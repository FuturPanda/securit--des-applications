# Cotations marche / carnet d'ordres

Un flux de prix haute frequence pour plusieurs instruments : carnet d'ordres (bids / asks),
abonnement du client par instrument, graphe temps reel, resynchronisation apres coupure.

## Demarrer

Le secret JWT est aléatoire à chaque démarrage (les anciens tokens expirent au redémarrage).
Pour conserver les tokens entre redémarrages, définir `JWT_SECRET` hors du dépôt.
Le token REST reste une **identité de démonstration choisie librement**, pas une authentification bancaire.

```bash
npm install
npm start          # http://localhost:3009
# ou : docker compose up --build
```

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

## Etat de la couche temps reel

Les cotations passent par SSE (un instrument par connexion), les offres et la presence par
Socket.IO. A la reconnexion, SSE rejoue les mises a jour numerotees disponibles (50 par
instrument), ou envoie un instantane si le trou est trop grand. Le bouton « Couper le flux SSE
3 s » permet une demonstration a deux navigateurs. Ce n'est pas une garantie de persistance
apres redemarrage du serveur. Verification du flux et des rooms :
`npx tsx src/realtime/recovery.test.ts`. `npm run scenario -- --avec-strategie` illustre
la convergence ; `src/realtime/naive-stub.ts` est conserve pour comparaison historique.

Demo : `npm start`, ouvrir `http://localhost:3009` dans deux navigateurs, selectionner ACME
sur chacun et noter leurs sequences. Generer un JWT pour chaque navigateur puis se connecter :
la presence passe a 2. Cliquer « Couper le flux SSE 3 s » dans un navigateur : l'autre
continue ; au retour, la liste « Cotations rejouées » affiche chaque sequence manquee
et son prix, puis les deux sequences convergent.
Changer l'instrument dans un onglet : la presence de la room ACME passe a 1.
Pour un trou de plus de 50 ticks, la verification automatisee teste le retour par instantane
sans imposer 26 secondes d'attente pendant la soutenance.

## Soutenance

[Conducteur chronométré (15 min), pré-vol et Q&A](docs/presentation/soutenance.md).

## Sécurité

Le [modèle de menace](docs/security/threat-model.md), le [rapport d'audit](docs/security/rapport-audit.md),
l'[ADR-2 sécurité](docs/security/ADR-2-priorisation-audit.md) et le [pipeline à quatre gates](docs/security/pipeline.md)
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
