import type { OrderCutoffPayload } from "@lfd/contracts";

/** Remplace une règle d'heure limite existante. */
export class UpdateOrderCutoffCommand {
  constructor(
    readonly id: string,
    readonly payload: OrderCutoffPayload,
  ) {}
}
