import type { AdminDeliveryNoteView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryNoteVersionsReader } from "../../domain/ports/delivery-note-versions.reader.js";
import { staffNoteOf } from "../../domain/services/delivery-note-sheet.js";
import {
  FIRST_CONTENT_VERSION,
  versionViewsOf,
} from "../../domain/services/delivery-note-version.js";
import { DeliveryNoteDocuments } from "../services/delivery-note-documents.js";
import { ListOrderDeliveryNotesQuery } from "./list-order-delivery-notes.query.js";

/**
 * Les BL d'une commande, **pour l'équipe** : numéro, état, dates, montants,
 * et leurs versions figées (plan du reliquat, § 5 ter) — la première est le
 * BL d'origine, la dernière le BL définitif.
 * Sans mur de société : `@AdminSurface` a déjà décidé, comme pour le bon.
 */
@QueryHandler(ListOrderDeliveryNotesQuery)
export class ListOrderDeliveryNotesHandler implements IQueryHandler<
  ListOrderDeliveryNotesQuery,
  readonly AdminDeliveryNoteView[]
> {
  constructor(
    private readonly documents: DeliveryNoteDocuments,
    private readonly versions: DeliveryNoteVersionsReader,
  ) {}

  async execute(query: ListOrderDeliveryNotesQuery): Promise<readonly AdminDeliveryNoteView[]> {
    const { head, billing } = await this.documents.order(query.orderId);
    const notes = await this.documents.listFor(query.orderId);
    const ids = notes.map((note) => note.id);
    const parts = await this.documents.partsOf(ids);
    const versions = await this.versions.versionsOf(ids);
    return notes.map((note) => {
      const kept = versionViewsOf(versions.get(note.id) ?? []);
      return {
        ...staffNoteOf(note, head, billing, parts.get(note.id)),
        versions: kept,
        originKept: kept.some((version) => version.version === FIRST_CONTENT_VERSION),
      };
    });
  }
}
