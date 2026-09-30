import type { PurchaseAssistantPayload } from "@lfd/contracts";

/**
 * **Comparer des formats de bac** sur un plancher saisi (géométrie du
 * plancher, G-D3) — une LECTURE : ni table, ni journal.
 */
export class AssistBinPurchaseQuery {
  constructor(readonly scenario: PurchaseAssistantPayload) {}
}
