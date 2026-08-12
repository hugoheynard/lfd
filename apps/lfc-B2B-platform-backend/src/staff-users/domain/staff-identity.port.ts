import type {
  IdentityToProvision,
  ProvisionedIdentity,
} from "../../shared/identity/provisioned-identity.js";

export type { IdentityToProvision, ProvisionedIdentity };

/**
 * Port vers le fournisseur d'identité, **vu par l'annuaire staff**.
 *
 * Trois gestes : ouvrir une identité, ré-émettre un lien, propager un
 * changement d'adresse — et pas un de plus.
 *
 * Le troisième a longtemps manqué, et son absence produisait exactement l'état
 * que le port client qualifie de pire : renommer quelqu'un dans l'annuaire le
 * laissait se connecter avec son ANCIENNE adresse, pendant que l'écran en
 * affichait une autre. La liaison par `sub` évitait la perte d'accès ; elle
 * n'évitait pas le mensonge.
 *
 * C'est ce qui interdit au contexte staff de dépendre du contexte `account` :
 * ils partagent la **mécanique** (`Auth0IdentityGateway`), pas leurs contrats.
 */
export abstract class StaffIdentityPort {
  /**
   * Ouvre une identité de connexion pour ce membre de l'équipe, sur la
   * **connexion staff**, et rend de quoi en poser le mot de passe.
   *
   * Idempotent sur l'adresse : ré-inviter quelqu'un réutilise son identité et
   * frappe un nouveau lien, sans jamais créer de doublon.
   *
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  abstract provision(input: IdentityToProvision): Promise<ProvisionedIdentity>;

  /**
   * Ré-émet un lien pour une identité **déjà ouverte** — le cas du « renvoyer ».
   *
   * Un lien est à usage unique et daté : on ne le retrouve pas, on en fabrique
   * un nouveau, et le précédent meurt à cet instant.
   *
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  abstract issuePasswordLink(subject: string): Promise<string>;

  /**
   * Propage une nouvelle adresse au fournisseur d'identité.
   *
   * L'adresse repart **non vérifiée**, avec l'e-mail de vérification d'Auth0 :
   * sans cela, un administrateur pourrait attribuer à un collègue une adresse
   * que celui-ci ne contrôle pas — et l'e-mail est ici un facteur
   * d'authentification, pas une simple coordonnée.
   *
   * @param subject `sub` de l'identité visée. L'appelant ne doit appeler ce
   *   geste que pour une fiche **déjà liée** : sans identité ouverte, il n'y a
   *   rien à propager, et rien à réparer non plus.
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  abstract changeEmail(subject: string, email: string): Promise<void>;
}
