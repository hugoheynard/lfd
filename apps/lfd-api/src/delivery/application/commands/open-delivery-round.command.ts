import type { OpenDeliveryRoundPayload } from "@lfd/contracts";

/**
 * Ouvrir une tournée — le passage suivant d'un véhicule ce jour-là.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * n'ouvre pas un second passage.
 */
export class OpenDeliveryRoundCommand {
  constructor(
    readonly payload: OpenDeliveryRoundPayload,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
