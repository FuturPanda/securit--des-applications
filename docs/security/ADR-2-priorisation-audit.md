# ADR-2 sécurité — prioriser les findings par risque résiduel dans le contexte

**Statut : accepté le 2026-10-05.** Cet « ADR-2 » répond au cours de sécurité ; il est
**distinct** de [l'ADR-2 temps réel : convergence des cotations](../adr/0002-strategie-de-convergence.md).

## Contexte

Cinq findings du [rapport d'audit](./rapport-audit.md) et moins d'une journée avant une
soutenance : on ne peut pas déployer une vraie authentification, un stockage durable et une
protection de charge tout en préparant deux démonstrations. Les critères doivent servir
également à un sixième finding futur. On protège d'abord l'attribution des bids et
l'intégrité des cotations (ER1 de la [passerelle EBIOS](./ebios-rm.md)), puis la continuité
du flux (ER2) ; il ne s'agit pas d'argent réel.

## Décision

Pour chaque finding **encore ouvert**, noter trois axes de 1 à 3 puis multiplier :

| Axe | 1 | 2 | 3 |
|---|---|---|---|
| Impact | gêne d'une démo, pas de bien essentiel touché | dégradation limitée d'un bien essentiel | événement redouté sérieux (ER1/ER3 gravité 4, ou perte du flux ER2 gravité 3) |
| Exploitabilité | condition longue/rare (ex. garder un socket 4 h) | script ou capacité de charge à organiser | requête immédiate, sans compétence ni préparation importante |
| Exposition | code mort/non joignable dans le flux actif | commande derrière un JWT ou contexte local privilégié | endpoint public accessible sans compte |

**Risque actuel = impact × exploitabilité × exposition**, 1 à 27. À égalité, traiter d'abord
la preuve la mieux vérifiée et la correction la plus courte ; signaler l'incertitude plutôt
que de maquiller une hypothèse en attaque démontrée. Un finding corrigé est marqué
« résiduel 0 » et sort de la file d'actions, mais conserve son score CVSS **initial** et
ses preuves historiques pour expliquer ce qui a été réparé. Un risque accepté reste
**ouvert** dans le rapport avec sa condition de réexamen.

Résultat : F1 (27, identité libre), F3 (18, SSE sans quota), F5 (12, bid dupliqué), F4
(6, socket expiré) ; F2 (clé littérale, 27 avant, 0 après correctif). Voir les calculs et
les cinq preuves dans le [rapport](./rapport-audit.md).

## Options écartées et conséquences

- **Ordre CVSS 4.0 décroissant seul** : F3 serait premier (8.7) et F1 seulement à 6.9,
  alors que l'identité usurpée permet aujourd'hui un faux bid attribué à un tiers (ER1,
  gravité 4) ; les 20 connexions SSE de la preuve ne démontrent pas une panne réelle.
  CVSS reste documenté avec son vecteur pour mesurer le potentiel technique, sans se
  substituer à la décision du projet.
- **Tout corriger avant de montrer quoi que ce soit** : irréaliste avant la soutenance ;
  masquerait les limites pédagogiques. La clé a été retirée du code et le pipeline passe,
  mais ce vert **ne certifie pas** les pseudonymes.

Cette règle dépriorise systématiquement les problèmes exigeant une connexion privilégiée
longue (F4) ou une hypothèse de déploiement non encore vraie. **Risque accepté jusqu'au
2026-10-06, soutenance seulement** : F1 n'est pas une authentification ; F3 n'a pas de
quota en environnement de démonstration. Avant toute exposition réelle, ces acceptations
expirent : choisir un mécanisme d'identité, ajouter des limites SSE et réévaluer le classement.
F5 est différé mais constitue une erreur de validation concrète à corriger avant d'affirmer
« aucun bid en double ». La clé F2 corrigée ne dispense pas de traiter F1. Responsable de
ces décisions et du contrôle avant déploiement : propriétaire du dépôt.
