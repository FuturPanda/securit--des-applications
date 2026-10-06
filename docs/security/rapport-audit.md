# Rapport d'audit — cotations de marché

- **Système audité** : [cotations, dépôt public](https://github.com/FuturPanda/securit--des-applications), commit [`788e35b`](https://github.com/FuturPanda/securit--des-applications/commit/788e35bc01a4c67489395953fd748212e197ef89), 2026-10-05.
- **Périmètre** : émission de JWT de démonstration (`src/rest.ts`), Socket.IO (`src/realtime/socketio/server.ts`), SSE (`src/realtime/sse.ts`), bids (`src/store.ts`), scans et historique Git. Une seule instance locale ; aucun compte réel ni transaction bancaire.
- **Hors périmètre** : infrastructure et montée en charge de production, Redis, prestataire d'identité, audit de code tiers. Le client historique est **trié**, pas utilisé comme flux principal.
- **Méthode** : [modèle de menace STRIDE](./threat-model.md), [événements redoutés EBIOS](./ebios-rm.md), revue manuelle de la cause, [Semgrep sur la PR de démonstration](https://github.com/FuturPanda/securit--des-applications/pull/15), preuves sur instance locale isolée via `npx tsx scripts/audit-proof.ts`. Les résultats mesurés portent sur le commit ci-dessus (hors ajout du script et de ce rapport).
- **Score** : CVSS **4.0 base**, calculé avec le [calculateur FIRST / Red Hat](https://github.com/FIRSTdotorg/cvss-v4-calculator/tree/c5b0d409ae9f57c44264c6ce5f27d89298e1d32a). Ce score décrit l'impact technique potentiel, pas l'impact réel d'une banque : les prix et bids sont simulés. Les vecteurs complets permettent de recalculer chaque score.

## Preuves à rejouer

```bash
npm ci
npx tsx scripts/audit-proof.ts
# F2, version historique (une clé de démonstration, pas un vrai secret) :
git show de1b2e4:src/realtime/ws/security-helpers.ts | grep 'export const SECRET'
# Version corrigée :
git show 788e35b:src/realtime/ws/security-helpers.ts | grep 'export const SECRET'
```

Sortie mesurée le 2026-10-05 : `F1: anonymous caller got an alice token and an accepted alice bid` ; `F3: 20 simultaneous unauthenticated SSE streams accepted` ; `F4: expired token rejected by verifyJwtPayload, but existing socket accepted bid` ; `F5: same empty requestId accepted twice as bid-3 and bid-4`. Le script appelle uniquement un serveur éphémère sur `127.0.0.1` et ferme ses connexions. **20 connexions acceptées ne prouvent pas un déni de service effectif** : elles prouvent l'absence de limite d'admission observée ; l'impact de saturation reste un scénario à tester en charge isolée.

## Findings

### F1 — Pseudonyme choisi librement et signé comme identité (ouvert, accepté pour la démo)

- **Source / cause** : revue manuelle et STRIDE S1 ; `src/rest.ts`, `POST /api/auth/token`, qui ne vérifie que `/^[a-zA-Z0-9_-]{2,32}$/` avant de signer `sub` avec `createJwt`. L'authentification Socket.IO vérifie ensuite la signature, pas l'identité de la personne.
- **Sévérité / CWE** : Medium, CVSS **6.9** `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N` ; **CWE-287** (Improper Authentication). `VI:L` : un faux bid peut influer sur le prochain prix simulé, mais l'effet est borné par tick ; pas de compte bancaire ni perte réelle.
- **Preuve** : `npx tsx scripts/audit-proof.ts` lance l'instance, fait un POST sans authentification avec `{"username":"alice"}`, vérifie `sub=alice`, connecte Socket.IO et obtient un ack positif pour un bid attribué à `alice`. Un autre visiteur peut choisir le même nom.
- **Impact / exploitabilité** : ER1 (attribution fausse et influence du cours), gravité 4/4 ; aucun compte ni compétence spéciale, une requête HTTP et un client Socket.IO suffisent. La clé aléatoire introduite pour CI **ne corrige pas** cette émission libre.
- **Décision / recommandation** : accepté jusqu'à la soutenance **uniquement** pour un marché pédagogique local ; nommer le champ « pseudonyme de démonstration », jamais « utilisateur vérifié ». Pour un service accessible avec vrais utilisateurs, émettre le JWT après une authentification réelle, puis lier `sub` à l'identité prouvée.

### F2 — Clé de signature JWT littérale dans le dépôt public (corrigé sur `main`)

- **Source / cause** : [finding Semgrep ERROR](https://github.com/FuturPanda/securit--des-applications/security/code-scanning/2) sur `demo/red-sast` et historique `git show de1b2e4:src/realtime/ws/security-helpers.ts` : `export const SECRET = 'change-moi'`. La cause est la déclaration du secret, pas l'appel de `jwt.verify`.
- **Sévérité / CWE** : Medium, CVSS **6.9** `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N` ; **CWE-798** (Use of Hard-coded Credentials). Même `VI:L` borné ; le vecteur reflète le défaut initial, pas la clé corrigée.
- **Preuve** : la commande `git show` ci-dessus affiche la cause initiale ; la [PR rouge, à ne pas fusionner](https://github.com/FuturPanda/securit--des-applications/pull/15) réintroduit **une ligne** pour reproduire la règle `rt-literal-jwt-secret`. Son [run](https://github.com/FuturPanda/securit--des-applications/actions/runs/37360915654) publie un SARIF puis échoue au step `Gate — ERROR findings or scanner failure`. Filtrer Security sur `demo/red-sast` ; `main` n'a pas ce finding.
- **Impact / exploitabilité** : ER1 (bid forgé en connaissant la clé initiale), gravité 4/4 ; dépôt public, clé lisible sans compte. La clé initiale est un mot de démonstration, **pas un secret de production**.
- **Décision / recommandation** : corrigé au commit [`22b3df0`](https://github.com/FuturPanda/securit--des-applications/commit/22b3df0) : clé de 32 octets aléatoire par processus ou `JWT_SECRET` hors dépôt, valeur externe courte refusée. Redémarrer révoque les anciens JWT si clé aléatoire. Si une vraie clé avait été publiée, la faire tourner et vérifier ses usages ; supprimer la ligne courante ne suffirait pas à effacer l'historique. F1 reste ouvert.

### F3 — Flux SSE anonyme sans quota de connexions (ouvert, accepté en local)

- **Source / cause** : menace STRIDE D1 ; `src/realtime/sse.ts`, `clients = new Map<string, Set<ServerResponse>>()` et `group.add(response)` sans plafond global ou par origine. `instrument` est filtré mais n'est pas une limite du nombre de clients.
- **Sévérité / CWE** : High, CVSS **8.7** `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N` ; **CWE-770** (Allocation of Resources Without Limits or Throttling). `VA:H` est le scénario potentiel si les ressources sont épuisées, **pas une panne démontrée**.
- **Preuve** : `npx tsx scripts/audit-proof.ts` ouvre 20 `GET /api/stream?instrument=ACME` sans token ; les 20 répondent HTTP 200 et restent ouvertes. Ne lancer un test de saturation que sur une instance locale contrôlée, jamais sur un tiers.
- **Impact / exploitabilité** : ER2 (flux indisponible), gravité 3/4 ; accès anonyme, mais épuiser réellement un hôte dépend de ses ressources et du nombre de connexions nécessaires.
- **Décision / recommandation** : accepté pour le démonstrateur sans exposition Internet garantie ; avant une mise en service, plafonner les SSE actifs globalement et par source, limiter la durée/écriture et mesurer les refus sous charge.

### F4 — Jeton expiré encore autorisé sur le socket existant (ouvert, différé)

- **Source / cause** : menace STRIDE E1 ; `src/realtime/socketio/server.ts` vérifie le JWT dans `io.use` **une fois**, puis `bid:place` utilise `socket.data.userId` sans réévaluer l'expiration ; `src/realtime/ws/security-helpers.ts` crée normalement un JWT de 4 h.
- **Sévérité / CWE** : Medium, CVSS **5.3** `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N` ; **CWE-613** (Insufficient Session Expiration). `PR:L` : possession préalable d'un token valide et d'une connexion acceptée ; impact limité au marché simulé.
- **Preuve** : `npx tsx scripts/audit-proof.ts` signe un JWT local d'**1 seconde**, connecte le socket, attend 1,2 s, constate que `verifyJwtPayload` retourne `null`, puis obtient quand même `{ok:true}` pour `bid:place` sur ce **même socket**. Le code ne contourne pas la vérification initiale.
- **Impact / exploitabilité** : ER3 (continuer à agir après expiration), gravité 4/4 ; il faut déjà posséder un token et maintenir une connexion ouverte jusqu'à son expiration. Une révocation de compte n'est pas implémentée non plus.
- **Décision / recommandation** : différé après la démonstration ; imposer une déconnexion à l'expiration et une vérification de droit/temps sur les commandes sensibles si des comptes réels apparaissent.

### F5 — `requestId` vide contourne la déduplication des bids (ouvert, différé)

- **Source / cause** : revue manuelle et STRIDE T2 ; `validerBid` dans `src/realtime/socketio/server.ts` accepte `''` (chaîne de longueur ≤100), puis `ajouterBid` dans `src/store.ts` ne mémorise la clé que si `nouveau.requestId` est truthy. Une chaîne vide n'a donc jamais de clé d'idempotence.
- **Sévérité / CWE** : Medium, CVSS **5.3** `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N` ; **CWE-20** (Improper Input Validation). `PR:L` : un JWT accepté est requis, même si F1 rend son obtention trivial dans cette démo ; le bid est limité en valeur/quantité.
- **Preuve** : `npx tsx scripts/audit-proof.ts` émet deux fois le même payload avec `requestId:''` sur un socket authentifié ; les deux ack sont positifs et renvoient deux IDs (`bid-3`, `bid-4` lors du run mesuré). Le test valide un doublon côté serveur, pas une transaction exécutée.
- **Impact / exploitabilité** : ER1 (deux offres au lieu d'une, pression répétée sur le prix), gravité 4/4 ; une simple émission Socket.IO suffit une fois connecté. Même avec un identifiant non vide, le cache de 1 000 requêtes ne survit pas au redémarrage.
- **Décision / recommandation** : correction courte à planifier : refuser `requestId.trim().length === 0` à la frontière de validation ; vérifier par un test de répétition. Pour une garantie financière, il faudrait aussi une persistance transactionnelle de la clé et du bid, hors du périmètre scolaire.

## Priorisation des risques résiduels

Les axes et leur règle de réutilisation vivent dans [l'ADR-2 sécurité](./ADR-2-priorisation-audit.md). Chaque facteur vaut 1–3 ; **risque = impact × exploitabilité × exposition**. Un finding corrigé sort de la file d'actions même si son CVSS *historique* reste pertinent pour raconter la correction.

| Rang actuel | Finding | Impact | Exploit. | Expo. | Produit résiduel | CVSS initial/base | Décision |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | F1 — pseudonyme signé sans preuve | 3 | 3 | 3 | **27** | 6.9 | accepter uniquement la démo, bloquer un vrai déploiement |
| 2 | F3 — SSE sans quota | 3 | 2 | 3 | **18** | 8.7 | accepter en local, traiter avant exposition |
| 3 | F5 — `requestId` vide | 2 | 3 | 2 | **12** | 5.3 | corriger avant de promettre l'idempotence complète |
| 4 | F4 — socket au-delà de l'expiration | 3 | 1 | 2 | **6** | 5.3 | différer tant que les sessions restent pédagogiques |
| — | F2 — clé littérale (historique) | 3 | 3 | 3 | **0 après correction** (27 avant) | 6.9 | corrigé sur `main` ; garder la PR uniquement comme preuve |

**Divergence assumée du CVSS** : F3 a le score technique le plus haut (8.7) mais F1 passe devant : dans ce sujet, l'attribution des bids et la fiabilité du prix (ER1, gravité 4) priment sur une indisponibilité théorique non observée (ER2, gravité 3). F5 passe devant F4 malgré leur CVSS identique : le doublon est immédiat ; F4 exige de garder un socket connecté au-delà de l'expiration. Après correction F2 n'est plus une action résiduelle, même si son score initial reste 6.9.

## Triage de l'alerte CodeQL hors des cinq findings

[CodeQL `js/xss` sur `public/index-old-naive-ws.html`](https://github.com/FuturPanda/securit--des-applications/security/code-scanning/1) pointe un `innerHTML` contenant un état reçu par WebSocket : **motif DOM dangereux réel**, non retenu comme finding exploitable du flux actuel sans source contrôlable. `npx tsx scripts/audit-proof.ts` vérifie que le fichier statique répond HTTP 200 mais que son client WebSocket nu vers `/` ne peut pas se connecter au serveur Socket.IO actuel (observé : `socket hang up`). Le site principal est `public/index.html`, avec ce vieux client conservé à titre pédagogique. **Limite** : ceci ne prouve pas l'innocuité du code si un serveur WS nu est réactivé ; supprimer/archiver la page historique ou remplacer les interpolations par `textContent` avant de la réutiliser. Ne pas désactiver globalement CodeQL.
