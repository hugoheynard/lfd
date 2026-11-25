import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type DeliveryNoteVersionSummary,
  DeliveryNoteVersionRenderedReader,
  DeliveryNoteVersionsReader,
} from "../domain/ports/delivery-note-versions.reader.js";
import type { RenderedClientNote } from "../domain/services/rendered-client-note.js";
import { causeOf, renderedOf } from "./delivery-note-version.json.js";

/**
 * **L'historique des documents** : les versions d'un bon, pour la liste de la
 * fiche, et l'entrée figée d'une version, pour son PDF. Avec l'écrivain, le
 * seul fichier qui lise `delivery_note_version`
 * (`lint:delivery-note-version-readers`) : ni la facture ni « livré = Σ des
 * BL » ne lisent une version — ils lisent le bon courant.
 */
@Injectable()
export class PrismaDeliveryNoteVersionsReader extends DeliveryNoteVersionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionsOf(
    noteIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryNoteVersionSummary[]>> {
    if (noteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryNoteVersion.findMany({
      where: { deliveryNoteId: { in: [...noteIds] } },
      orderBy: [{ deliveryNoteId: "asc" }, { contentVersion: "asc" }],
      select: { deliveryNoteId: true, contentVersion: true, cause: true, recordedAt: true },
    });
    const byNote = new Map<string, DeliveryNoteVersionSummary[]>();
    for (const row of rows) {
      const list = byNote.get(row.deliveryNoteId) ?? [];
      list.push({
        contentVersion: row.contentVersion,
        cause: causeOf(row.deliveryNoteId, row.contentVersion, row.cause),
        recordedAt: row.recordedAt,
      });
      byNote.set(row.deliveryNoteId, list);
    }
    return byNote;
  }
}

/** L'entrée figée d'une version, d'où son PDF se rend seul. */
@Injectable()
export class PrismaDeliveryNoteVersionRenderedReader extends DeliveryNoteVersionRenderedReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async renderedOf(noteId: string, contentVersion: number): Promise<RenderedClientNote | null> {
    const row = await this.prisma.deliveryNoteVersion.findUnique({
      where: { deliveryNoteId_contentVersion: { deliveryNoteId: noteId, contentVersion } },
      select: { rendered: true },
    });
    return row === null ? null : renderedOf(noteId, contentVersion, row.rendered);
  }
}
