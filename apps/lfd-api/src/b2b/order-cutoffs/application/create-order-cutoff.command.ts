import type { OrderCutoffPayload } from "@lfd/contracts";

/** Crée une règle d'heure limite (point de retrait × jour). */
export class CreateOrderCutoffCommand {
  constructor(readonly payload: OrderCutoffPayload) {}
}
