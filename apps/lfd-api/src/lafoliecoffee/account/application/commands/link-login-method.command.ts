/**
 * Rattache une méthode de connexion de plus au compte de la personne connectée.
 *
 * `subject` accompagne `userId` : le rattachement se fait chez le fournisseur
 * d'identité, qui ne connaît que le `sub` ; `userId` sert au refus qui se lit
 * chez nous (ce compte tiers ouvre-t-il déjà un AUTRE compte ?) et au journal.
 *
 * `idToken` est la **preuve** que la même personne tient la session du compte
 * qu'elle ajoute. Il n'est ni journalisé, ni renvoyé, ni écrit : il vaut ouverture
 * de ce compte-là pendant les minutes qui suivent son émission.
 */
export class LinkLoginMethodCommand {
  constructor(
    readonly userId: string,
    readonly subject: string,
    readonly idToken: string,
  ) {}
}
