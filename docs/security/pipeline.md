# Pipeline de sécurité — démonstration

Workflow : [security.yml](../../.github/workflows/security.yml), déclenché sur `push` et `pull_request`.
Chaque scanner termine avant un **step de seuil distinct** ; les rapports sont conservés même si
la décision est rouge. Un rapport absent ou une panne de scanner fait aussi échouer le gate.

| Famille | Cible | Seuil | Preuve |
|---|---|---|---|
| Semgrep (SAST) | `src/`, règles `p/ci` + `.semgrep/` | au moins un ERROR | SARIF `semgrep` dans Security → Code scanning |
| npm audit (dépendances) | `package-lock.json` | au moins un high/critical ; moderate affiché | `audit.json` dans les artefacts Actions |
| Gitleaks (secrets) | historique Git complet | au moins un secret détecté | `gitleaks.json` dans les artefacts Actions ; le faible secret de démonstration initial n'est pas détecté par entropie |
| Trivy (image) | image construite depuis ce Dockerfile | au moins un high/critical | SARIF `trivy-image` dans Security → Code scanning |

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

- [Exécution verte sur `main`](https://github.com/FuturPanda/securit--des-applications/actions/runs/37360435594) : les quatre jobs passent ; `npm audit` ne remonte plus de vulnérabilité à la date du run.
- [PR de régression, à ne pas fusionner](https://github.com/FuturPanda/securit--des-applications/pull/15) : sa branche contient une **clé JWT volontairement littérale**. Le [run rouge](https://github.com/FuturPanda/securit--des-applications/actions/runs/37360915654) échoue dans `Gate — ERROR findings or scanner failure` du job `sast`, après l'upload SARIF. Les autres familles restent vertes.
- [Finding Semgrep dans Security](https://github.com/FuturPanda/securit--des-applications/security/code-scanning/2) : sélectionner la branche `demo/red-sast` si la vue par défaut n'affiche que les alertes de `main`. Le résultat est sur la branche de démo, **pas** sur `main`.

Après la présentation, fermer la PR et supprimer la branche de régression. Sur `main`, la clé est
aléatoire par processus (ou fournie via `JWT_SECRET` hors dépôt) : une clé de moins de 32 octets
est refusée. `POST /api/auth/token` accepte toujours un pseudonyme choisi librement : le scan
vert ne prouve pas une authentification bancaire. Voir [le modèle de menace](./threat-model.md).

Quand un job casse : lire le step **Gate**, puis le rapport SARIF/JSON associé. Une sortie sans
rapport indique une panne du scanner, pas une application sans risque. Corriger le code ou
consigner l'acceptation du risque dans le rapport d'audit ; ne pas supprimer le gate pour obtenir
du vert.
