import type { OrderCutoffPayload } from "@lfd/contracts";

/** Pose ou règle la règle générale d'heure limite (la seule depuis le 2026-10-21). */
export class DefineGeneralOrderCutoffCommand {
  constructor(readonly payload: OrderCutoffPayload) {}
}
