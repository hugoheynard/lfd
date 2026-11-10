import type { OrderOpeningExemptionPayload } from "@lfd/contracts";

/**
 * Laisser une société ou une adresse commander malgré la fermeture de sa
 * clientèle (décision de Hugo du 2026-10-26). Acte **staff** : l'auteur est
 * figé dans la ligne. Rend l'identifiant de l'exemption.
 */
export class GrantOrderOpeningExemptionCommand {
  constructor(
    readonly payload: OrderOpeningExemptionPayload,
    readonly staffUserId: string,
  ) {}
}
