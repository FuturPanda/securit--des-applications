# Tranche 3 (s3-ws) - WebSocket bas niveau + sécurité du handshake

## Ce qu'elle montre

- ce que `ws` fait à votre place : handshake HTTP Upgrade (code 101), framing des messages,
  réponse automatique aux `ping` par un `pong`.
- **sécurité au handshake** (`verifyClient`) : JWT obligatoire, `Origin` contrôlée. Codes
  distincts : `401` (token) vs `403` (origine).
- **keepalive** : `ping`/`pong` applicatif toutes les 30 s, on coupe les connexions muettes.
- **rate-limiting** : au-delà de 20 messages/s, la connexion est fermée (`1008`).

## Lancer

```bash
npm start
npm run ws:token          # genere un JWT de test
wscat -c "ws://localhost:3009?token=<TOKEN>"
wscat -c ws://localhost:3009          # refuse : 401
```

## À observer

- capture du handshake : DevTools &gt; Network &gt; WS, en-têtes `Sec-WebSocket-Key` /
  `Sec-WebSocket-Accept`, statut `101`.
- flood : `for (let i=0;i<50;i++) socket.send('x')` depuis un client connecté → fermeture `1008`
  après ~20 messages.
