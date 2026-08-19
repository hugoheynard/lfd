/**
 * Fait de domaine : **une personne vient de créer son compte** (self-signup
 * provisionné à la volée au premier accès authentifié). Signal « lead mid » du
 * module croissance — inscrit, pas encore de commande.
 */
export class UserRegisteredEvent {
  constructor(
    readonly userId: string,
    /** E-mail au moment de l'inscription (vide si le token n'en portait pas). */
    readonly email: string,
  ) {}
}
