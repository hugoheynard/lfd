import type { SaleUnit } from "@lfd/money";
import type { DeliveryOrderLine } from "./delivery-order-lines.reader.js";

/** Les pièces d'un article qui ne partent pas. */
export interface DeliveryAbandonedLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"` (P6). */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/** Un départ incomplet décidé : le sort du reste, et ce qui ne part pas. */
export interface DeliveryShortfall {
  /** `abandoned` seul aujourd'hui ; « à relivrer » viendra avec le reliquat (E7). */
  readonly remainder: "abandoned";
  readonly lines: readonly DeliveryAbandonedLine[];
}

/** Ce qui PART d'une commande, et ce qui n'en part pas. */
export interface DeliveryDeparture {
  /**
   * Les lignes, dans l'ordre de la commande, aux quantités qui partent — une
   * ligne qui ne part pas du tout est absente (elle est dans {@link shortfall}).
   */
  readonly lines: readonly DeliveryOrderLine[];
  /** Le départ incomplet décidé, ou `null` sans décision. */
  readonly shortfall: DeliveryShortfall | null;
}

/**
 * **Ce qui part d'une commande, vu par le livreur** (2026-10-25) — ce que la
 * livraison DÉCLARE et que le commerce implémente, relié dans `appBootstrap`.
 *
 * Un port à lui plutôt qu'un changement de `DeliveryOrderLinesReader` : la
 * proposition de colisage lit les lignes DUES, la fiche de « Ma tournée » ce
 * qui PART d'un départ incomplet décidé (ISP). **Aucun montant.**
 */
export abstract class DeliveryDeparturesReader {
  /** Ce qui part de cette commande ; aucune ligne si elle est inconnue. */
  abstract departureOf(orderId: string): Promise<DeliveryDeparture>;
}
