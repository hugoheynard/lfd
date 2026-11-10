import type { UpdateIdentityPayload } from "@lfd/contracts";

/**
 * Édite l'identité souple (enseigne + n° de TVA). L'identité légale reste fixée.
 *
 * Commande **staff** (Porte B) : le commercial complète une société **à la
 * place** du client. Contrairement aux commandes client (`actorUserId → roleOf →
 * ensureCompanyAdmin`), elle ne porte **pas d'acteur** et **ne franchit aucun
 * mur membership** — le staff n'est membre d'aucune société. L'autorisation est
 * portée **en amont** par `AdminAuthGuard` sur la route `admin/*`. Même patron
 * que `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */
export class UpdateIdentityByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly payload: UpdateIdentityPayload,
  ) {}
}
