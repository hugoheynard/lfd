import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import {
  type DeliveryNoteVersionRecord,
  DeliveryNoteVersionWriter,
} from "../domain/ports/delivery-note-version.writer.js";
import { renderedJson } from "./delivery-note-version.json.js";

/**
 * `delivery_note_version`, par le client routé — dans la transaction du dépôt
 * des bons. `ON CONFLICT DO NOTHING` sur `(delivery_note_id, content_version)` :
 * une version déjà rangée reste celle qui est née, sans faire avorter la
 * transaction de l'appelant.
 *
 * Un des deux seuls fichiers qui touchent la table
 * (`lint:delivery-note-version-readers`).
 */
@Injectable()
export class PrismaDeliveryNoteVersionWriter extends DeliveryNoteVersionWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async record(version: DeliveryNoteVersionRecord): Promise<void> {
    await this.prisma.deliveryNoteVersion.createMany({
      data: [
        {
          id: this.ids.next(),
          deliveryNoteId: version.noteId,
          contentVersion: version.contentVersion,
          cause: version.cause,
          rendered: renderedJson(version.rendered),
          recordedAt: version.recordedAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}
