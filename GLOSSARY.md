# Cotations de marché

Simulation d'un marché à plusieurs instruments, sans exécution de transactions bancaires réelles.

## Language

**Instrument** :
Actif identifié par un symbole dont le marché publie les cotations et le carnet d'ordres.

**Cotation** :
Mise à jour du prix et du carnet d'un instrument publiée par le marché simulé.
_Éviter_ : transaction

**Carnet d'ordres** :
Vue courante des niveaux d'achat et de vente d'un instrument.

**Bid** :
Offre d'achat soumise par un utilisateur ou la simulation ; son acceptation n'est pas l'exécution d'une transaction.
_Éviter_ : transaction, achat exécuté
