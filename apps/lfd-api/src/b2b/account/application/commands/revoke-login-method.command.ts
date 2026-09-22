/**
 * Retire une méthode de connexion du compte de la personne connectée.
 *
 * Elle se désigne par son seul **nom de connexion** (`google-oauth2`) : c'est
 * l'API qui retrouve l'identifiant secondaire chez le fournisseur. Le faire
 * porter par l'appelant aurait mis un identifiant tiers dans une URL, donc dans
 * tous les journaux d'accès (plan `plan-rattachement-depuis-le-profil.md`, §9.5).
 */
export class RevokeLoginMethodCommand {
  constructor(
    readonly userId: string,
    readonly subject: string,
    readonly provider: string,
  ) {}
}
