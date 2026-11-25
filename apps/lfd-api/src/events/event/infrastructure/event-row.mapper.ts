import type {
  Event as EventRow,
  FunctionSheet as FunctionSheetRow,
} from "../../../platform/database/client/client.js";
import { Event } from "../domain/entities/event.js";
import type { FunctionSheetState } from "../domain/entities/function-sheet.js";
import { EventApplications } from "../domain/value-objects/event-applications.js";
import { EventDate } from "../domain/value-objects/event-date.js";
import { EventName } from "../domain/value-objects/event-name.js";

/** Les fiches à charger avec l'événement : toutes, retirées comprises. */
export const EVENT_INCLUDE = { functionSheets: true } as const;

/** Ligne → agrégat ; les value objects revalident. */
export function eventFromRow(
  row: EventRow & { readonly functionSheets: readonly FunctionSheetRow[] },
): Event {
  return Event.rehydrate({
    id: row.id,
    name: EventName.of(row.name),
    date: EventDate.fromUtcDate(row.eventDate),
    applications: EventApplications.of(row.applications),
    archivedAt: row.archivedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sheets: row.functionSheets.map(sheetStateFromRow),
  });
}

function sheetStateFromRow(row: FunctionSheetRow): FunctionSheetState {
  return {
    id: row.id,
    fileName: row.fileName,
    storageKey: row.storageKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    position: row.position,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    archivedAt: row.archivedAt,
    replacesSheetId: row.replacesSheetId,
  };
}
