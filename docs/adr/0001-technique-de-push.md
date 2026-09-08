# ADR-1 : technique de push

## Statut

Propose a l'etape 2.

La decision sera reevaluee a l'etape 4 lors de l'ajout des abonnements par
instrument.

## Contexte

L'application diffuse en temps reel les carnets d'ordres et les derniers prix
depuis le serveur vers les navigateurs.

Le flux principal est actuellement unidirectionnel : le serveur produit les
cotations et les clients les affichent. Les clients n'ont pas besoin d'envoyer
des donnees sur cette meme connexion.

La solution doit aussi permettre aux clients de se reconnecter apres une
interruption et de recuperer les evenements qu'ils ont manques.

## Options envisagees

- Le long-polling est simple et compatible avec HTTP, mais necessite une
  succession de requetes et ajoute de la latence et du trafic inutile.
- SSE maintient une connexion HTTP unidirectionnelle, possede une API native
  dans le navigateur avec `EventSource` et gere automatiquement la reconnexion
  et `Last-Event-ID`.
- WebSocket fournit une communication bidirectionnelle, mais cette possibilite
  n'est pas necessaire pour le flux de cotations actuel. Il demande egalement
  de gerer explicitement la reconnexion et le rattrapage des evenements.
- WebRTC permet une communication directe entre clients, mais necessite une
  signalisation et une gestion de connexion plus complexes. Le serveur reste
  par ailleurs la source d'autorite des cotations.

## Decision

Nous retenons Server-Sent Events pour le flux principal de cotations.

SSE correspond au sens naturel du flux, du serveur vers le client, et s'integre
directement au protocole HTTP utilise par l'application.

Chaque evenement recoit un identifiant. Le serveur conserve un buffer borne des
100 derniers evenements. Lors d'une reconnexion, le navigateur envoie
automatiquement `Last-Event-ID`, ce qui permet au serveur de rejouer les
evenements manques.

Si l'identifiant demande est plus ancien que le buffer, le serveur emet un
evenement `resync-needed` afin que le client recharge un etat complet.

Un heartbeat est envoye regulierement pour maintenir la connexion et detecter
les clients deconnectes.

## Pourquoi pas WebRTC pour le flux principal

WebRTC est principalement adapte aux communications directes entre clients,
par exemple pour partager une analyse privee entre deux utilisateurs.

Dans notre cas, les cotations sont produites et controlees par le serveur. Une
connexion pair-a-pair compliquerait inutilement la signalisation, la securite
et la coherence des donnees, sans supprimer la necessite d'avoir le serveur
comme source d'autorite.

WebRTC pourra etre utilise plus tard pour un flux prive entre utilisateurs,
mais pas pour diffuser le flux principal du marche.

## Consequences

Avantages :

- utilisation d'une connexion HTTP standard ;
- API `EventSource` native dans le navigateur ;
- reconnexion automatique ;
- prise en charge de `Last-Event-ID` ;
- possibilite de rejouer les evenements conserves dans le buffer ;
- format texte simple a observer et a deboguer.

Limites :

- communication uniquement du serveur vers le client ;
- les donnees envoyees par le client necessitent une requete HTTP separee ;
- le buffer est conserve en memoire et disparait au redemarrage du serveur ;
- le buffer n'est pas partage entre plusieurs instances du serveur ;
- le serveur diffuse encore tous les instruments a tous les clients ;
- un depassement du buffer necessite une resynchronisation complete.

L'ajout futur d'abonnements, d'acquittements ou d'autres echanges
bidirectionnels pourra conduire a remplacer SSE par WebSocket ou Socket.IO.
