import type { DeferredTerm } from "@lfd/contracts";

/**
 * Fixe la condition de règlement **convenue** — l'acte proprement staff : le
 * client ne peut que *demander*, seul le commercial *convient*.
 *
 * Commande **staff** (Porte B) : le commercial complète une société **à la
 * place** du client. Contrairement aux commandes client (`actorUserId → roleOf →
 * ensureCompanyAdmin`), elle ne porte **pas d'acteur** et **ne franchit aucun
 * mur membership** — le staff n'est membre d'aucune société. L'autorisation est
 * portée **en amont** par `AdminAuthGuard` sur la route `admin/*`. Même patron
 * que `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */
export class GrantTermsCommand {
  constructor(
    readonly companyId: string,
    readonly grantedTerms: readonly DeferredTerm[],
  ) {}
}
