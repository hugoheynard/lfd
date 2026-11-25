import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Event } from "../domain/entities/event.js";
import type { FunctionSheet } from "../domain/entities/function-sheet.js";
import { EventRepository } from "../domain/ports/event.repository.js";
import { EVENT_INCLUDE, eventFromRow } from "./event-row.mapper.js";

/**
 * Adaptateur Prisma d'écriture des événements : l'agrégat ↔ `events.event`
 * et ses fiches. Rejoint l'unité de travail ambiante.
 */
@Injectable()
export class PrismaEventRepository extends EventRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(eventId: string): Promise<Event | null> {
    const row = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: EVENT_INCLUDE,
    });
    return row === null ? null : eventFromRow(row);
  }

  async save(event: Event): Promise<void> {
    const columns = {
      name: event.name.value,
      eventDate: event.date.toUtcDate(),
      applications: [...event.applications.values],
      archivedAt: event.archivedAt,
      updatedAt: event.updatedAt,
    };
    await this.prisma.event.upsert({
      where: { id: event.id },
      create: { id: event.id, createdBy: event.createdBy, createdAt: event.createdAt, ...columns },
      update: columns,
    });
    // Les retirées d'abord : une version neuve prend le rang de celle qu'elle
    // remplace, et l'unicité partielle du rang refuserait l'inverse.
    const retiredFirst = [...event.sheets].sort((a, b) => Number(a.isActive) - Number(b.isActive));
    for (const sheet of retiredFirst) {
      await this.saveSheet(event.id, sheet);
    }
  }

  /** Une fiche neuve se crée ; une fiche connue ne change que par son retrait. */
  private async saveSheet(eventId: string, sheet: FunctionSheet): Promise<void> {
    await this.prisma.functionSheet.upsert({
      where: { id: sheet.id },
      create: {
        id: sheet.id,
        eventId,
        fileName: sheet.fileName,
        storageKey: sheet.storageKey,
        contentType: sheet.contentType,
        sizeBytes: sheet.sizeBytes,
        position: sheet.position,
        uploadedBy: sheet.uploadedBy,
        uploadedAt: sheet.uploadedAt,
        archivedAt: sheet.archivedAt,
        replacesSheetId: sheet.replacesSheetId,
      },
      update: { archivedAt: sheet.archivedAt },
    });
  }
}
