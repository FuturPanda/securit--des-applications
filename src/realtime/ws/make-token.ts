import { createJwt, SECRET } from './security-helpers.ts'

// Genere un token de test valable 4h. Le client Socket.IO le transmet avec :
//   io({ auth: { token: '<TOKEN>' } })
console.log(createJwt('demo-user', SECRET))
