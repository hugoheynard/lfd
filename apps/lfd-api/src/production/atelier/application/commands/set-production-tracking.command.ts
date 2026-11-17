import type { ProductionTrackingLevel } from "@lfd/contracts";

/** Poser le niveau de suivi du fournil et sa marge. */
export class SetProductionTrackingCommand {
  constructor(
    readonly level: ProductionTrackingLevel,
    readonly marginMinutes: number,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : rejouer ce
     * réglage après celui de quelqu'un d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
