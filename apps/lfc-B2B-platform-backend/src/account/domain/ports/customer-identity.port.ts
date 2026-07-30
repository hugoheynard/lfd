/**
 * Port vers le **fournisseur d'identité** (Auth0), propriétaire de l'e-mail de
 * connexion.
 *
 * Notre base stocke l'e-mail comme clé humaine, mais c'est Auth0 qui authentifie
 * avec. Changer l'un sans l'autre produirait le pire des états : l'utilisateur se
 * connecte avec une adresse et l'application lui en affiche une autre. Le
 * changement passe donc par ici, et notre écriture n'a lieu qu'après.
 *
 * Port dans le domaine, adaptateur dans `infrastructure/` : le handler ne sait
 * pas qu'il existe une Management API, un jeton M2M ou un `PATCH /api/v2/users`.
 */
export abstract class CustomerIdentityPort {
  /**
   * Propage la nouvelle adresse au fournisseur d'identité.
   *
   * @param subject `sub` Auth0 de la personne (son identifiant chez eux).
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec —
   *   l'appelant doit alors renoncer à l'écriture locale.
   */
  abstract changeEmail(subject: string, email: string): Promise<void>;
}
