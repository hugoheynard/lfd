import type { ProductionTrackingLevel } from "@lfd/contracts";

/** Régler le niveau de suivi propre d'un poste en service ; `null` : il suit le fournil. */
export class SetWorkstationTrackingLevelCommand {
  constructor(
    readonly workstationId: string,
    readonly trackingLevel: ProductionTrackingLevel | null,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : rejouer ce
     * réglage après celui de quelqu'un d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
