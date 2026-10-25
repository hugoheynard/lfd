/** La pierre tombale : l'en-tête figé au plan, sans ligne, déjà retirée. */
export interface PackingSheetTombstone {
  readonly serviceDay: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly dueAt: string | null;
  readonly clientele: "pro" | "public" | null;
  readonly siteId: string | null;
  /** L'instant du retrait — aussi `drawn_at` : une pierre tombale n'a pas été tirée. */
  readonly withdrawnAt: Date;
}

/**
 * **Les pierres tombales du colisage** — port d'ÉCRITURE (plan A1, § 2.2).
 *
 * ⚠️ Une écriture ciblée, et c'est le cas que le §3.1 autorise : poser la
 * ligne est un `INSERT … ON CONFLICT DO NOTHING` qui ne peut rien refuser. Si
 * la feuille existe déjà (le tirage est passé entre-temps), il n'écrit rien,
 * et c'est l'agrégat, relu sous verrou, qui la retire. La clé est celle de la
 * feuille `(service_day, order_id)` : le tirage qui arrive après trouve la
 * ligne et n'insère pas les siennes.
 */
export abstract class PackingSheetTombstones {
  abstract lay(tombstone: PackingSheetTombstone): Promise<void>;
}
