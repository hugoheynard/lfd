import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import {
  type EventFunctionSheets,
  EventFunctionSheetsReader,
} from "../../../production/channels/events/index.js";
import { inForceSheetsOn } from "./in-force-function-sheets.query.js";

/**
 * Les fiches en vigueur d'un jour, lues au stockage du fournil où le dépôt
 * les a rangées. Une clé connue en base et absente du stockage est une
 * panne (`read`, pas `readIfPresent`) : le dossier part sans les fiches et
 * n'est pas archivé, plutôt que d'en omettre une en silence.
 */
@Injectable()
export class StoredEventFunctionSheetsReader extends EventFunctionSheetsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProductionDocumentStore,
  ) {
    super();
  }

  async sheetsFor(serviceDay: string): Promise<readonly EventFunctionSheets[]> {
    const rows = await inForceSheetsOn(this.prisma, serviceDay);
    const files = await Promise.all(
      rows.map(async (row) => ({ row, bytes: await this.store.read(row.storageKey) })),
    );
    const byEvent = new Map<string, EventFunctionSheets>();
    for (const { row, bytes } of files) {
      const event = byEvent.get(row.eventId) ?? {
        eventId: row.eventId,
        eventName: row.eventName,
        sheets: [],
      };
      byEvent.set(row.eventId, {
        ...event,
        sheets: [...event.sheets, { sheetId: row.sheetId, fileName: row.fileName, bytes }],
      });
    }
    return [...byEvent.values()];
  }
}
