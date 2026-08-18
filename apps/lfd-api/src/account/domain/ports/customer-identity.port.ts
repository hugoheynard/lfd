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
import type {
  IdentityToProvision,
  ProvisionedIdentity,
} from "../../../shared/identity/provisioned-identity.js";

// Ré-exportés pour que les appelants du port n'aient pas à connaître deux
// chemins : la **forme** est partagée avec le contexte staff, le **contrat**
// reste celui-ci.
export type { IdentityToProvision, ProvisionedIdentity };

export abstract class CustomerIdentityPort {
  /**
   * Propage la nouvelle adresse au fournisseur d'identité.
   *
   * @param subject `sub` Auth0 de la personne (son identifiant chez eux).
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec —
   *   l'appelant doit alors renoncer à l'écriture locale.
   */
  abstract changeEmail(subject: string, email: string): Promise<void>;

  /**
   * Ouvre une identité de connexion et rend de quoi en poser le mot de passe.
   *
   * **Aucun mot de passe n'est choisi ici**, ni par nous ni par le commercial :
   * seul le détenteur de la boîte e-mail peut en poser un, ce qui fait de
   * l'adresse la preuve d'identité. Un mot de passe provisoire dicté au
   * téléphone serait un mot de passe connu de deux personnes.
   *
   * **Idempotent sur l'e-mail** : si une identité existe déjà pour cette
   * adresse, elle est réutilisée et un nouveau lien est émis. Le commercial qui
   * ré-invite quelqu'un ne doit pas se heurter à un conflit — et surtout, cela
   * ne doit pas créer un doublon d'identité.
   *
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  abstract provision(input: IdentityToProvision): Promise<ProvisionedIdentity>;

  /**
   * Ré-émet un lien de mot de passe pour une identité **déjà ouverte**.
   *
   * C'est ce que « renvoyer le lien » veut dire, et il n'y a pas d'autre façon
   * de le faire : un lien est à usage unique et daté, on ne le retrouve pas, on
   * en fabrique un nouveau. Sans cette opération, renvoyer se réduirait à
   * ré-écrire un e-mail sans rien dedans.
   *
   * @param subject `sub` du fournisseur — l'identité visée.
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  abstract issuePasswordLink(subject: string): Promise<string>;
}
