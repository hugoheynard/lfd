import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { EventApplication } from "../../event/domain/value-objects/event-applications.js";
import { EventDate } from "../../event/domain/value-objects/event-date.js";

/** L'application que le fournil sert : seuls ses événements entrent au dossier. */
const PRODUCTION_APPLICATION: EventApplication = "lafoliecoffee";

/** Une fiche en vigueur d'un événement du jour, avec ce qu'il faut pour la lire. */
export interface InForceSheetRow {
  readonly eventId: string;
  readonly eventName: string;
  readonly sheetId: string;
  readonly fileName: string;
  readonly storageKey: string;
}

/**
 * Les fiches **en vigueur** des événements non archivés de ce jour qui
 * concernent la Folie Coffee : événements par création, fiches par rang.
 * Une seule requête, partagée par les deux lectures du canal.
 */
export async function inForceSheetsOn(
  prisma: PrismaService,
  serviceDay: string,
): Promise<readonly InForceSheetRow[]> {
  const events = await prisma.event.findMany({
    where: {
      eventDate: EventDate.fromString(serviceDay).toUtcDate(),
      archivedAt: null,
      applications: { has: PRODUCTION_APPLICATION },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      functionSheets: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, fileName: true, storageKey: true },
      },
    },
  });
  return events.flatMap((event) =>
    event.functionSheets.map((sheet) => ({
      eventId: event.id,
      eventName: event.name,
      sheetId: sheet.id,
      fileName: sheet.fileName,
      storageKey: sheet.storageKey,
    })),
  );
}
