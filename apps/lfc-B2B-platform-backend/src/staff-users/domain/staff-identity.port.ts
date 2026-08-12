import type {
  IdentityToProvision,
  ProvisionedIdentity,
} from "../../shared/identity/provisioned-identity.js";

export type { IdentityToProvision, ProvisionedIdentity };

/**
 * Port vers le fournisseur d'identité, **vu par l'annuaire staff**.
 *
 * Deux gestes, et pas un de plus : ouvrir une identité, ré-émettre un lien.
 * Le port client en déclare un troisième — propager un changement d'adresse —
 * qui n'a pas d'équivalent ici : l'e-mail d'un membre de l'équipe change par
 * l'annuaire, et rien n'est encore câblé vers Auth0. Déclarer ce geste
 * l'annoncerait comme disponible ; le taire dit la vérité.
 *
 * C'est aussi ce qui interdit au contexte staff de dépendre du contexte
 * `account` : ils partagent la **mécanique** (`Auth0IdentityGateway`), pas leurs
 * contrats.
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
}
