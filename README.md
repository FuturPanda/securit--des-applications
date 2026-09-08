# Cotations marche / carnet d'ordres

Un flux de prix haute frequence pour plusieurs instruments : carnet d'ordres (bids / asks),
abonnement du client par instrument, graphe temps reel, resynchronisation apres coupure.

## Demarrer

```bash
npm install
npm start          # http://localhost:3000
# ou : docker compose up --build
```

## API REST

| Methode | Route | Description |
|---|---|---|
| GET | `/api/instruments` | liste des instruments |
| GET | `/api/instruments/:sym/book` | carnet courant d'un instrument |
| GET | `/api/instruments/:sym/history?from=<seq>` | historique des prix depuis un numero de sequence |

Donnees de demonstration : `npm run seed` (4 instruments, 200 ticks rejouables par instrument).

## Etat de la couche temps reel

Stub volontairement naif (`src/realtime/naive-stub.ts`) : il diffuse le carnet **de tous les
instruments** a **tous les clients**, en continu, sans abonnement ni numero de sequence
exploitable. `TRANSPOSITION.md` liste ce qui est a corriger. Le cas de resynchronisation apres
coupure : `npm run scenario`.

## Structure

```
src/domain.ts              instruments, carnet, generateur de ticks deterministe (pur)
src/store.ts               etat en memoire + avancee du marche
src/rest.ts                routes Fastify
src/server.ts              point d'entree
src/seed.ts                donnees de demonstration
src/realtime/naive-stub.ts       LE stub a remplacer
src/realtime/security-helpers.ts   verification JWT + Origin + RateLimiter (fourni)
src/realtime/convergence.exemple.ts  strategie de convergence adaptee (fourni, a brancher)
src/realtime/piege.scenario.ts   la resynchronisation snapshot + delta a implementer
public/index.html          front de demonstration
docs/adr/                  vos Architecture Decision Records
```
