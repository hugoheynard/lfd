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
} from "../../../../platform/shared/identity/provisioned-identity.js";

// Ré-exportés pour que les appelants du port n'aient pas à connaître deux
// chemins : la **forme** est partagée avec le contexte staff, le **contrat**
// reste celui-ci.
export type { IdentityToProvision, ProvisionedIdentity };

/**
 * Une **méthode de connexion** rattachée à un compte, dans le vocabulaire du
 * domaine.
 *
 * `secondaryUserId` n'en sort **pas** : il ne sert qu'à l'adaptateur, pour
 * adresser le détachement chez le fournisseur. La vue servie au front n'en
 * porte pas (cf. `LoginMethodView` de `@lfd/contracts`), et aucune URL ne
 * l'écrit — un identifiant tiers dans un chemin finit dans tous les journaux
 * d'accès.
 */
export interface LoginMethod {
  /** La stratégie — `auth0`, `google-oauth2`, `facebook`. */
  readonly provider: string;
  /** L'identifiant **chez le fournisseur**, sans le préfixe de stratégie. */
  readonly secondaryUserId: string;
  /** La base d'utilisateurs visée ; absente sur certaines connexions sociales. */
  readonly connection: string | null;
  /** Vrai pour l'identité qui porte le compte — elle ne se détache jamais. */
  readonly isPrimary: boolean;
}

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

  /**
   * Les **méthodes de connexion** du compte, telles que le fournisseur les tient.
   *
   * C'est le prix du rattachement chez lui : la liste n'est pas chez nous, donc
   * la lire est un appel réseau sortant. Elle ne se sert jamais sur un chemin
   * d'amorçage.
   *
   * @throws {IdentitySubjectUnknownError} le fournisseur ne connaît pas ce sujet.
   */
  abstract listLoginMethods(subject: string): Promise<readonly LoginMethod[]>;

  /**
   * **Absorbe** une identité secondaire dans ce compte, sur preuve.
   *
   * `idToken` est la preuve que la même personne tient les deux sessions ; le
   * fournisseur en extrait lui-même le sujet secondaire. Aucune adresse n'est
   * lue, ni comparée, ni recopiée — c'est ce qui rend impossible de s'approprier
   * un compte en écrivant son adresse quelque part.
   *
   * @returns les méthodes du compte APRÈS rattachement.
   * @throws {IdentityLinkRefusedError} le fournisseur refuse (jeton inutilisable
   *   pour lui, identité déjà rattachée ailleurs).
   */
  abstract linkLoginMethod(subject: string, idToken: string): Promise<readonly LoginMethod[]>;

  /**
   * Détache une identité **secondaire**. Rend les méthodes restantes.
   *
   * ⚠️ Détacher ne supprime rien chez le fournisseur : l'identité redevient un
   * utilisateur autonome. C'est l'appelant qui doit le dire à l'écran.
   *
   * @throws {IdentityUnlinkRefusedError} ce n'est pas une identité secondaire
   *   de ce compte (déjà détachée, ou principale).
   */
  abstract unlinkLoginMethod(
    subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]>;
}
