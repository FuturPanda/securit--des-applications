# Pipeline de sécurité — démonstration

Workflow : [security.yml](../../.github/workflows/security.yml), déclenché sur `push` et `pull_request`.
Chaque scanner termine avant un **step de seuil distinct** ; les rapports sont conservés même si
la décision est rouge. Un rapport absent ou une panne de scanner fait aussi échouer le gate.

| Famille | Cible | Seuil | Preuve |
|---|---|---|---|
| Semgrep (SAST) | `src/`, règles `p/ci` + `.semgrep/` | au moins un ERROR | SARIF `semgrep` dans Security → Code scanning |
| npm audit (dépendances) | `package-lock.json` | au moins un high/critical ; moderate affiché | `audit.json` dans les artefacts Actions |
| Aube audit (dépendances) | `package-lock.json`, job indépendant `aube-audit` | au moins un high/critical ou scanner en panne | `aube-audit.json` dans les artefacts Actions ; l'audit des vulnérabilités est distinct de `paranoid` à l'installation |
| OSV Scanner (dépendances) | `package-lock.json`, job indépendant `osv-scanner` | **toute** vulnérabilité signalée ou scanner en panne | `osv.json` dans les artefacts Actions ; seuil volontairement plus strict que npm/Aube |
| Gitleaks (secrets) | historique Git complet | au moins un secret détecté | `gitleaks.json` dans les artefacts Actions ; le faible secret de démonstration initial n'est pas détecté par entropie |
| Trivy (image) | image construite depuis ce Dockerfile | au moins un high/critical | SARIF `trivy-image` dans Security → Code scanning |
| Trivy SBOM (inventaire) | image construite depuis ce Dockerfile, job `sbom` | SBOM absente, non CycloneDX ou sans composant | `sbom.cdx.json` dans les artefacts Actions ; inventaire des composants, **pas** une détection de vulnérabilité |
| ZAP baseline (DAST) | application démarrée par `docker compose`, job `dast` | au moins une alerte de risque **High** ou scanner en panne | `zap.json` et `zap.html` dans les artefacts Actions ; alertes Medium/Low affichées sans bloquer |

## Portée réelle du DAST et de la SBOM

Le job `dast` lance l'image avec `docker compose up -d --build`, attend une réponse sur
`/api/instruments`, puis exécute un **ZAP baseline** (passif, 2 minutes d'exploration) contre
`http://127.0.0.1:3009`. Il couvre surtout les en-têtes HTTP et les routes REST atteignables
par exploration. Il **n'exerce ni SSE ni Socket.IO**, et ne détecte aucun de nos findings
métier : pseudonyme choisi librement (F1), jeton expiré sur socket ouvert (F4) ou `requestId`
vide (F5) restent prouvés par `scripts/audit-proof.ts`. Un baseline vert ne signifie donc pas
« application testée dynamiquement » ; il n'y a ni scan actif, ni authentification rejouée,
ni test de charge.

La SBOM CycloneDX produite par Trivy inventorie les composants de l'image livrée, système
et npm. C'est une **liste de composants**, utile pour répondre à « sommes-nous affectés par
cette CVE ? » ; la décision de blocage sur vulnérabilité reste celle des jobs `dependencies`,
`aube-audit`, `osv-scanner` et `image`. Le gate `sbom` échoue seulement si l'inventaire est
absent, mal formé ou vide. La SBOM n'est ni signée ni publiée hors des artefacts du run.

## Télécharger les SARIF

Une fois les jobs **security** et **CodeQL** terminés sur le même commit `main`, ouvrir
**Actions → Export SARIF → Run workflow** (branche `main`). Le run publie un artefact
`sarif-<SHA>` contenant les **deux SARIF CodeQL** (JavaScript/TypeScript et Actions),
`semgrep.sarif` et `trivy-image.sarif`, récupérés depuis les analyses Code scanning
pour **ce SHA exact**. Si une analyse manque encore, attendre sa fin et relancer
l'export ; aucun résultat d'un ancien commit n'est substitué. CodeQL est en
configuration automatique GitHub, pas dans `security.yml`. `npm-audit` et `gitleaks`
sont déjà téléchargeables comme artefacts **JSON** du run `security` : ils ne sont
pas des SARIF. La branche rouge `demo/red-sast` se consulte dans Security ; cet
export manuel est réservé au `main`.

## Rejouer la démonstration

- [Exécution verte des six jobs sur `main`](https://github.com/FuturPanda/securit--des-applications/actions/runs/37439574704) : Aube et OSV passent **indépendamment** des quatre jobs d'origine ; les deux artefacts JSON sont téléchargeables. Aube indique 0 high/critical, OSV 0 résultat sur le lockfile committé à ce SHA.
- [PR de régression, à ne pas fusionner](https://github.com/FuturPanda/securit--des-applications/pull/15) : sa branche contient une **clé JWT volontairement littérale**. Le [run rouge historique](https://github.com/FuturPanda/securit--des-applications/actions/runs/37360915654) échoue dans `Gate — ERROR findings or scanner failure` du job `sast`, après l'upload SARIF. Les trois autres jobs d'origine restent verts sur ce run ; il précède Aube/OSV.
- [Finding Semgrep dans Security](https://github.com/FuturPanda/securit--des-applications/security/code-scanning/2) : sélectionner la branche `demo/red-sast` si la vue par défaut n'affiche que les alertes de `main`. Le résultat est sur la branche de démo, **pas** sur `main`.

Après la présentation, fermer la PR et supprimer la branche de régression. Sur `main`, la clé est
aléatoire par processus (ou fournie via `JWT_SECRET` hors dépôt) : une clé de moins de 32 octets
est refusée. `POST /api/auth/token` accepte toujours un pseudonyme choisi librement : le scan
vert ne prouve pas une authentification bancaire. Voir [le modèle de menace](./threat-model.md).

Quand un job casse : lire le step **Gate**, puis le rapport SARIF/JSON associé. Une sortie sans
rapport indique une panne du scanner, pas une application sans risque. Corriger le code ou
consigner l'acceptation du risque dans le rapport d'audit ; ne pas supprimer le gate pour obtenir
du vert.
