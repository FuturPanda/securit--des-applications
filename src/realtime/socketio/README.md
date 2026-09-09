# Socket.IO authentifie

Le serveur Socket.IO est attache au meme serveur HTTP que Fastify. Toute connexion doit fournir
un JWT valide dans `auth.token`.

## Essai rapide

Generer le token de demonstration existant :

```bash
npm run ws:token
```

Puis le transmettre depuis un client Socket.IO :

```ts
import { io } from 'socket.io-client'

const socket = io('http://localhost:3009', {
  auth: { token: '<TOKEN>' },
})

socket.on('auth:ready', ({ userId }) => {
  console.log(`connecte en tant que ${userId}`)
})

socket.on('connect_error', (error) => {
  console.error(error.message)
})
```

Le serveur recupere l'identite dans le champ `sub` du JWT et la conserve dans
`socket.data.userId`. Un token absent, invalide ou sans `sub` non vide est refuse.

## Evenements de bids

- `bid:history` : les 30 derniers bids, envoye apres authentification ;
- `bid:new` : un bid simule ou Socket.IO diffuse en temps reel ;
- `bid:place` : `{ requestId, instrument, prix, quantite }`, avec acquittement du serveur.

Le `requestId` rend une nouvelle tentative idempotente pour un meme utilisateur.
