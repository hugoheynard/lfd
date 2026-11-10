import type { ShortfallQuantity } from "../../domain/entities/order-shortfall.js";

/** Le colisage a signalé un manque sur cet envoi `(commande, rang)` (lots E6a, LB). */
export class RecordOrderShortfallCommand {
  constructor(
    readonly reference: string,
    readonly rank: number,
    readonly reportedAt: Date,
    readonly lines: readonly ShortfallQuantity[],
  ) {}
}
