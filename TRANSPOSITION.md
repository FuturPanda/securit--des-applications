# Transposition temps reel - cotations marche

Ce projet part d'un **stub temps reel naif** (`src/realtime/naive-stub.ts`). A chaque etape,
vous en remplacez une tranche par la technique vue sur le kit de reference.

| Étape | Defaut du stub a corriger | Ce que vous branchez | Cible dans ce projet |
|---|---|---|---|
| 1 | (constat) | rien : vous listez par ecrit ce qui ne va pas | onglet Reseau : le carnet de tous les instruments arrive en continu ; coupure = ticks perdus |
| 2 | diffusion "push tout a tout le monde" | canal **SSE** + buffer borne + `Last-Event-ID` | flux de prix (serveur -> client), candidat naturel a confronter a WS dans l'ADR-1 |
| 3 | `WebSocketServer` nu, aucune securite | serveur **`ws`** + handshake JWT + `Origin` + rate-limit | le point d'entree du flux |
| 4 | pas de room : tous les instruments melanges | **Socket.IO** + room `instrument:<symbole>` + `subscribe` avec ack | une room par instrument |
| 5 | pas de presence des abonnes | presence legere par instrument + snapshot du carnet a la connexion | qui regarde quel instrument |
| 6 | etat courant seulement, aucun rattrapage | **snapshot + delta numerote** + coalescing + resync par n° de sequence | `src/realtime/piege.scenario.ts` : petit trou -> deltas, grand trou -> snapshot |
| 7 | instance unique | `@socket.io/redis-adapter` + 2 instances + proxy | fan-out par instrument |
| 8 | (stub deja remplace) | **WebRTC** : data channel P2P (flux prive entre 2 utilisateurs) + chaos reseau | partage d'analyse P2P |

Les ADR correspondants : `docs/adr/0001` (etape 2, acceptee etape 4), `docs/adr/0002` (etape 6), `docs/adr/0003`
(etape 7, acceptee etape 8).

## Code fourni pour vous aider

- `src/realtime/security-helpers.ts` : verification JWT + `Origin` + `RateLimiter` (etape 3), a brancher.
- `src/realtime/convergence.exemple.ts` : la strategie de convergence deja adaptee a ce projet
  (etape 6). Vous la branchez, vous ne la reecrivez pas.
- `src/realtime/piege.scenario.ts` : le cas de concurrence.
  `npm run scenario` echoue (stub) ; `npm run scenario -- --avec-strategie` reussit (strategie branchee).

## Constat initial (a remplir a l'etape 1)

<Decrivez en 3 a 5 phrases ce que vous observez en lancant `npm start` et en ouvrant 2 onglets :
ce qui fonctionne mal dans la couche temps reel, et pourquoi.>
