import type { EventDetailView, EventSummaryView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { EventReader, type EventWindow } from "../domain/ports/event.reader.js";
import { EventDate } from "../domain/value-objects/event-date.js";

/** Les fiches en vigueur seulement : une fiche retirée ne se montre ni ne se compte. */
const ACTIVE_SHEETS = { archivedAt: null } as const;

/** Une ligne de la table, telle que la base la rend. */
interface SummaryRow {
  readonly id: string;
  readonly name: string;
  readonly eventDate: Date;
  readonly applications: readonly string[];
  readonly _count: { readonly functionSheets: number };
}

/** Adaptateur Prisma de lecture des événements. */
@Injectable()
export class PrismaEventReader extends EventReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(window: EventWindow, today: string): Promise<readonly EventSummaryView[]> {
    const from = window.from === null ? null : EventDate.fromString(window.from).toUtcDate();
    const to = window.to === null ? null : EventDate.fromString(window.to).toUtcDate();
    const pivot = EventDate.fromString(today).toUtcDate();
    const select = {
      id: true,
      name: true,
      eventDate: true,
      applications: true,
      _count: { select: { functionSheets: { where: ACTIVE_SHEETS } } },
    } as const;
    const range = { ...(from === null ? {} : { gte: from }), ...(to === null ? {} : { lte: to }) };
    const [upcoming, past] = await Promise.all([
      this.prisma.event.findMany({
        where: { archivedAt: null, eventDate: { ...range, gte: maxDate(from, pivot) } },
        select,
        orderBy: [{ eventDate: "asc" }, { id: "asc" }],
      }),
      this.prisma.event.findMany({
        where: { archivedAt: null, eventDate: { ...range, lt: pivot } },
        select,
        orderBy: [{ eventDate: "desc" }, { id: "asc" }],
      }),
    ]);
    return [...upcoming, ...past].map(toSummary);
  }

  async detail(eventId: string): Promise<EventDetailView | null> {
    const row = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { functionSheets: { where: ACTIVE_SHEETS, orderBy: { position: "asc" } } },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      date: EventDate.fromUtcDate(row.eventDate).value,
      applications: row.applications,
      archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
      functionSheets: row.functionSheets.map((sheet) => ({
        id: sheet.id,
        fileName: sheet.fileName,
        sizeBytes: sheet.sizeBytes,
        uploadedBy: sheet.uploadedBy,
        uploadedAt: sheet.uploadedAt.toISOString(),
      })),
    };
  }
}

function maxDate(a: Date | null, b: Date): Date {
  return a !== null && a.getTime() > b.getTime() ? a : b;
}

function toSummary(row: SummaryRow): EventSummaryView {
  return {
    id: row.id,
    name: row.name,
    date: EventDate.fromUtcDate(row.eventDate).value,
    applications: row.applications,
    functionSheetCount: row._count.functionSheets,
  };
}
