import type { DeliveryNoteVersionCause } from "../services/delivery-note-version.js";
import type { RenderedClientNote } from "../services/rendered-client-note.js";

/** Une version composée, prête à ranger. */
export interface DeliveryNoteVersionRecord {
  readonly noteId: string;
  readonly contentVersion: number;
  readonly cause: DeliveryNoteVersionCause;
  readonly rendered: RenderedClientNote;
  readonly recordedAt: Date;
}

/**
 * Port d'**écriture** des versions d'un bon — seul le gardien l'appelle, dans
 * la transaction du dépôt. Une version déjà rangée reste telle quelle : une
 * version est une trace, elle ne se réécrit pas.
 */
export abstract class DeliveryNoteVersionWriter {
  abstract record(version: DeliveryNoteVersionRecord): Promise<void>;
}
