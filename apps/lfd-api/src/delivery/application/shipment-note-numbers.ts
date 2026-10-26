import type {
  DeliveryNoteNumbersReader,
  DeliveryShipmentKey,
  DeliveryShipmentNoteNumber,
} from "../channels/commerce/index.js";

/**
 * **Les numéros de BL lus au tirage**, rangés par envoi `(commande, rang)`
 * (2026-10-26). Une table à deux niveaux plutôt qu'une clé `orderId#rang` :
 * une chaîne recomposée se recoupe à la main (la raison de `ShipmentRef`).
 */
export class ShipmentNoteNumbers {
  private constructor(private readonly byOrder: ReadonlyMap<string, ReadonlyMap<number, string>>) {}

  /** Aucun numéro : un papier sans BL, ou un tirage qui ne les lit pas. */
  static readonly NONE = ShipmentNoteNumbers.of([]);

  static of(numbers: readonly DeliveryShipmentNoteNumber[]): ShipmentNoteNumbers {
    const byOrder = new Map<string, Map<number, string>>();
    for (const note of numbers) {
      const ranks = byOrder.get(note.orderId) ?? new Map<number, string>();
      ranks.set(note.rank, note.number);
      byOrder.set(note.orderId, ranks);
    }
    return new ShipmentNoteNumbers(byOrder);
  }

  /** Lit les numéros de ces envois au commerce ; aucune lecture sans envoi. */
  static async read(
    reader: DeliveryNoteNumbersReader,
    shipments: readonly DeliveryShipmentKey[],
  ): Promise<ShipmentNoteNumbers> {
    return shipments.length === 0
      ? ShipmentNoteNumbers.NONE
      : ShipmentNoteNumbers.of(await reader.numbersOf(shipments));
  }

  /** Le numéro du BL de cet envoi, ou `null` : aucun BL vivant — rien ne s'imprime. */
  numberOf(orderId: string, rank: number): string | null {
    return this.byOrder.get(orderId)?.get(rank) ?? null;
  }
}
