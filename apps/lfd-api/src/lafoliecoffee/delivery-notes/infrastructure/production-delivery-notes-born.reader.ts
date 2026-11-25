import { Injectable } from "@nestjs/common";

import { DeliveryNotesBornReader } from "../../../production/channels/commerce/index.js";
import { DeliveryNoteRepository } from "../domain/ports/delivery-note.repository.js";

/**
 * L'adaptateur de `DeliveryNotesBornReader` (fournil) : une seule lecture des
 * BL de toutes les commandes demandées, et celles qui n'en ont aucun vivant.
 * Un BL annulé ne compte pas : le dossier n'en imprime pas.
 */
@Injectable()
export class ProductionDeliveryNotesBornReader extends DeliveryNotesBornReader {
  constructor(private readonly notes: DeliveryNoteRepository) {
    super();
  }

  async withoutNote(orderIds: readonly string[]): Promise<readonly string[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const notes = await this.notes.loadForOrders(orderIds);
    const born = new Set(
      notes.filter((note) => note.status !== "voided").map((note) => note.orderId),
    );
    return [...new Set(orderIds)].filter((orderId) => !born.has(orderId));
  }
}
