import type { FulfillmentPreferencePayload } from "@lfd/contracts";

/**
 * Pose la **préférence d'acheminement** de la société : comment ce client est
 * servi d'habitude.
 *
 * Geste staff comme les autres pièces — mais qui, lui, ne conditionne rien :
 * c'est un défaut offert à la commande, que le client peut écarter au panier.
 *
 * Commande **staff** (Porte B) : le commercial complète une société **à la
 * place** du client. Contrairement aux commandes client (`actorUserId → roleOf →
 * ensureCompanyAdmin`), elle ne porte **pas d'acteur** et **ne franchit aucun
 * mur membership** — le staff n'est membre d'aucune société. L'autorisation est
 * portée **en amont** par `AdminAuthGuard` sur la route `admin/*`. Même patron
 * que `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */
export class PreferFulfillmentByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly preference: FulfillmentPreferencePayload,
  ) {}
}
