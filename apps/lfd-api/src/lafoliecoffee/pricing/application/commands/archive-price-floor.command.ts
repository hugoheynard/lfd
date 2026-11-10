import type { FloorClientele } from "../../domain/entities/pricing-floor.js";
import type { PriceScope } from "../../domain/price-rule.js";

/** **Archiver** une limite. Même raison que pour une règle : rien ne s'efface. */
export class ArchivePriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly clientele: FloorClientele,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
