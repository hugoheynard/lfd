import type { DeliveryAddressPayload } from "@lfd/contracts";

/**
 * Remplace une adresse de livraison **à la place du client**.
 *
 * Le pendant staff de `UpdateDeliveryAddressCommand`. Le commercial corrige un
 * code d'accès, un créneau ou un contact au téléphone — obliger le client à le
 * faire lui-même, c'est une livraison ratée en attendant qu'il s'y mette.
 *
 * Commande **staff** (Porte B) : le commercial complète une société **à la
 * place** du client. Contrairement aux commandes client (`actorUserId → roleOf →
 * ensureCompanyAdmin`), elle ne porte **pas d'acteur** et **ne franchit aucun
 * mur membership** — le staff n'est membre d'aucune société. L'autorisation est
 * portée **en amont** par `AdminAuthGuard` sur la route `admin/*`. Même patron
 * que `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */
export class UpdateDeliveryAddressByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly payload: DeliveryAddressPayload,
  ) {}
}
