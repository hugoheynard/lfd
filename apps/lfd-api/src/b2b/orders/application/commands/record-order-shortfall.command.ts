import type { ShortfallQuantity } from "../../domain/entities/order-shortfall.js";

/** Le colisage a signalé un manque sur cette commande (lot E6a). */
export class RecordOrderShortfallCommand {
  constructor(
    readonly reference: string,
    readonly reportedAt: Date,
    readonly lines: readonly ShortfallQuantity[],
  ) {}
}
