import type { OpenPackingContainer } from "@lfd/contracts";

/** Créer un contenant — un bac de livraison ou un sac — pour une commande (K2b). */
export class OpenPackingContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly request: OpenPackingContainer,
    readonly staffUserId: string,
  ) {}
}
