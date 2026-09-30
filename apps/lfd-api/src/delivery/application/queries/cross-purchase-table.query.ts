import type { PurchaseTablePayload } from "@lfd/contracts";

/**
 * **Croiser des véhicules et des formats de bacs** (bibliothèque d'achat,
 * B-D4) — une LECTURE : ni table écrite, ni journal.
 */
export class CrossPurchaseTableQuery {
  constructor(readonly selection: PurchaseTablePayload) {}
}
