import type { CarriedOrderTransferRow } from "./carried-order-transfers.reader.js";

/** Un transfert qui ne porte que des réassorts, et où il en est. */
export interface ResupplyOnlyTransferRow extends CarriedOrderTransferRow {
  readonly siteId: string;
  readonly resupplyCount: number;
}

/**
 * **Les transferts de réassort seul d'une journée** (R3c, R3e) — au moins un
 * réassort porté, aucune commande portée. Une lecture, qui ne verrouille rien.
 */
export abstract class ResupplyOnlyTransfers {
  abstract resupplyOnlyOn(serviceDay: string): Promise<readonly ResupplyOnlyTransferRow[]>;
}
