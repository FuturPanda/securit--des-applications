// ============================================================================
//  LE STUB TEMPS REEL NAIF - a remplacer, une tranche a la fois (voir TRANSPOSITION.md).
// ============================================================================
//  Defauts VOLONTAIRES (chaque etape en corrige un) :
//   - un seul WebSocketServer global : pas de room, tout le monde voit tout        (etape 4)
//   - setInterval rediffuse l'ETAT COMPLET a tous, qu'il ait change ou non         (etapes 2, 5)
//   - onmessage applique l'entree cliente telle quelle : aucune validation,
//     aucune autorisation, dernier ecrivain gagne                                  (etapes 3, 6)
//   - rien a la reconnexion : le client qui revient a perdu l'intervalle           (etapes 2, 6)
//   - instance unique : ne passe pas a l'echelle                                   (etape 7)
//   - pas de presence, pas de signal ephemere                                      (etape 5)
// ============================================================================

export interface NaiveHooks<TInput> {
  /** L'etat complet a diffuser (serialise en JSON tel quel). */
  fullState(): unknown
  /** Valide/parse un message client ; renvoie null pour ignorer. */
  parseInput(raw: unknown): TInput | null
  /** Applique l'entree cliente. Aucune garantie d'ordre ni de convergence. */
  applyInput(input: TInput): void
}


