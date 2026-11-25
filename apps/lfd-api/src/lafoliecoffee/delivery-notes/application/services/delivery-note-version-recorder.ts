import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  DeliveryNoteVersionKeeper,
  type KeptDeliveryNote,
} from "../../domain/ports/delivery-note-version.keeper.js";
import { DeliveryNoteVersionWriter } from "../../domain/ports/delivery-note-version.writer.js";
import type { DeliveryNoteVersionCause } from "../../domain/services/delivery-note-version.js";
import { DeliveryNoteDocuments } from "./delivery-note-documents.js";

/**
 * **Le gardien des versions du bon** (`documentation/commandes/reliquat/reliquat.md`, § 7) : compose le
 * BL client par {@link DeliveryNoteDocuments.clientNote} — le composeur de la
 * route du PDF — et le range. Appelé par le dépôt dans sa transaction : les
 * lectures du composeur voient le bon tel qu'il vient d'être écrit.
 *
 * Un refus du composeur (commande introuvable, bon sans en-tête) remonte et
 * annule l'écriture du bon : un contenu qui ne se fige pas ne s'écrit pas.
 */
@Injectable()
export class DeliveryNoteVersionRecorder extends DeliveryNoteVersionKeeper {
  constructor(
    private readonly documents: DeliveryNoteDocuments,
    private readonly writer: DeliveryNoteVersionWriter,
    private readonly clock: Clock,
  ) {
    super();
  }

  async keep(
    note: KeptDeliveryNote,
    contentVersion: number,
    cause: DeliveryNoteVersionCause,
  ): Promise<void> {
    const rendered = await this.documents.clientNote(note.orderId, note.number);
    await this.writer.record({
      noteId: note.id,
      contentVersion,
      cause,
      rendered,
      recordedAt: this.clock.now(),
    });
  }
}
