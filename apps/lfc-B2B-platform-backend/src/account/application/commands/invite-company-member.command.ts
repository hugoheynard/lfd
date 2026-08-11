import type { CompanyRole } from "../../domain/value-objects/company-role.js";

/**
 * Ouvre un **accès** à l'espace d'une société — le détenteur, ou un collègue.
 *
 * Une seule commande pour les deux, parce que le commercial les vit comme un
 * seul geste : ce qui les distingue est le rôle, pas l'action. En faire deux
 * obligerait l'appelant à savoir d'avance lequel il crée.
 *
 * `invitedBy` est le `sub` du staff : une **trace**, pas une autorisation (la
 * porte est le guard).
 */
export class InviteCompanyMemberCommand {
  constructor(
    readonly companyId: string,
    readonly email: string,
    readonly firstName: string,
    readonly lastName: string,
    readonly phone: string,
    readonly role: CompanyRole,
    readonly invitedBy: string,
  ) {}
}
