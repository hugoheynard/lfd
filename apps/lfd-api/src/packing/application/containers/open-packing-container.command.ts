import type { OpenPackingContainer } from "@lfd/contracts";

/**
 * Créer un contenant — un bac de livraison ou un sac — pour une commande (K2b).
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * n'ouvre qu'un contenant.
 */
export class OpenPackingContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly request: OpenPackingContainer,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
