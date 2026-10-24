import { Injectable } from "@nestjs/common";

import { PlannedDeliveryNoteVoiding } from "../../../orders/domain/ports/delivery-note-planning.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";

/**
 * **L'annulation d'une commande annule son BL prévu** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`, § 6,
 * bloquant 2) — dans l'unité de travail de l'annulation. Le BL reste en base,
 * annulé, et garde son numéro.
 */
@Injectable()
export class PlannedDeliveryNoteVoider extends PlannedDeliveryNoteVoiding {
  constructor(private readonly notes: DeliveryNoteRepository) {
    super();
  }

  async voidPlannedFor(orderId: string, at: Date): Promise<void> {
    const notes = await this.notes.loadForOrders([orderId]);
    for (const note of notes.filter((candidate) => candidate.status === "planned")) {
      note.void(at);
      await this.notes.save(note);
    }
  }
}
