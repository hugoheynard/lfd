import type { DoorstepRule } from "@lfd/contracts";

/**
 * Redéfinit sur une adresse — ou rend au réglage global (`null`) — la
 * **décision réglée d'avance** sur un problème à la porte
 * (`documentation/livraisons/livreur/a-la-porte.md`, B3 bis, LB-Q6).
 *
 * Le commercial seul : une route à part sous `delivery_procedures`, comme
 * « dépôt autorisé » (AP-D5). Le client ne la règle pas — c'est la réponse
 * du commerce quand le client ne respecte pas les conditions convenues.
 */
export class SetDeliveryDoorstepRuleByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly rule: DoorstepRule | null,
  ) {}
}
