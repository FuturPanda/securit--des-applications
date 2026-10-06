# Événements redoutés — passerelle EBIOS RM (simulation locale)

Ce document exprime **ce qui importe pour le projet cotations** et relie les scénarios techniques prioritaires aux événements redoutés. Le [modèle de menace STRIDE](./threat-model.md) décrit, séparément, le DFD, les frontières, les menaces et les exigences. Il ne s'agit **pas** d'une étude EBIOS RM complète : ni ateliers d'écosystème, ni sources de risque et scénarios stratégiques formalisés, ni transactions bancaires réelles.

## Biens essentiels et événements redoutés

| Bien essentiel | Propriété attendue |
|---|---|
| Cotations et carnet d'ordres | Intégrité : le prix montré correspond à l'état du serveur, par instrument. |
| Continuité du flux et état de reprise | Disponibilité : un spectateur peut recevoir les nouveaux ticks et se resynchroniser. |
| Attribution des bids et de la présence | Authenticité : un bid est attribué au bon utilisateur, sans doublon accepté. |
| Identifiants de démonstration et historique des bids | Confidentialité limitée : ne pas confondre pseudonyme public et identité vérifiée. |

| Événement redouté | Gravité /4 | Pourquoi |
|---|---:|---|
| **ER1** — Un faux bid influe sur le prix ou est attribué à un tiers ; décision sur une cotation trompeuse. | 4 | Un bid agressif modifie le tick suivant (`src/store.ts`), même si l'impact est borné. |
| **ER2** — Le flux de cotations devient indisponible ou la reprise ne fonctionne plus. | 3 | La démonstration et la lecture du marché cessent, sans préjudice financier réel ici. |
| **ER3** — Un acteur non autorisé continue à placer des bids sous une identité supposée expirée/révoquée. | 4 | Le contrôle d'accès cesse de refléter la validité du jeton. |

## Passerelle depuis les menaces STRIDE prioritaires

| Menace H (frontière) | Bien / événement redouté | Source → chemin → impact | Preuve / limite |
|---|---|---|---|
| **S1** — usurpation (REST B1 → Socket.IO B3) | Attribution des bids + intégrité des cotations / **ER1 (4)** | Visiteur choisit le nom d'autrui sur REST → JWT valable → bid agressif → attribution trompeuse et pression sur le prix. Historiquement, le secret public donnait un second chemin, maintenant supprimé. | [F1](./rapport-audit.md#f1--pseudonyme-choisi-librement-et-signé-comme-identité-ouvert-accepté-pour-la-démo) ; sortir le secret du code ne corrige **pas** l'émission libre de tokens. |
| **D1** — épuisement SSE (B2) | Continuité du flux / **ER2 (3)** | Client anonyme multiplie les connexions persistantes → sockets et écritures serveur potentiellement saturés → cotations indisponibles. | [F3](./rapport-audit.md#f3--flux-sse-anonyme-sans-quota-de-connexions-ouvert-accepté-en-local) ; 20 flux acceptés, **aucune panne mesurée**. |
| **E1** — jeton expiré sur canal ouvert (B3/B4) | Attribution des bids / **ER3 (4)** | Client obtient un JWT → reste connecté après expiration → `bid:place` encore accepté → action non autorisée attribuée au compte. | [F4](./rapport-audit.md#f4--jeton-expiré-encore-autorisé-sur-le-socket-existant-ouvert-différé) ; preuve locale avec jeton court, pas de mécanisme de révocation. |

**À dire à l'oral** : STRIDE nomme les modes d'attaque sur les flux ; ici, la passerelle indique **pourquoi** ils comptent pour la simulation. Les exigences et H/M/L sont dans le [modèle technique](./threat-model.md#2-stride-sur-les-frontières-et-les-flux) ; le classement résiduel et les décisions de traitement sont dans [l'ADR-2 sécurité](./ADR-2-priorisation-audit.md) et [l'audit](./rapport-audit.md). Une gravité 4/4 désigne ce scénario pédagogique, **pas** un impact financier constaté.
