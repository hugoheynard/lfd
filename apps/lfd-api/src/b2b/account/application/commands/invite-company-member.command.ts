import type { CompanyRole } from "../../domain/value-objects/company-role.js";

/**
 * Ouvre un **accès** à l'espace d'une société — le détenteur, ou un collègue.
 *
 * Une seule commande pour les deux, parce que le commercial les vit comme un
 * seul geste : ce qui les distingue est le rôle, pas l'action. En faire deux
 * obligerait l'appelant à savoir d'avance lequel il crée.
 *
 * `invitedBy` est l'id de la fiche du staff : une **trace**, pas une autorisation (la
 * porte est le guard).
 *
 * `intentKey` est la clé d'intention que l'écran a fabriquée à l'ouverture du
 * dialogue (en-tête `Idempotency-Key`) : un second clic de même clé ne
 * réexécute rien et rend le résultat du premier (plan
 * `plan-service-e-mails.md`, revue, cas 4).
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
    readonly intentKey: string,
  ) {}
}
