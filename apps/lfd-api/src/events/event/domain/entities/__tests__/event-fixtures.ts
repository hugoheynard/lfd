import { Event } from "../event.js";
import { EventApplications } from "../../value-objects/event-applications.js";
import { EventDate } from "../../value-objects/event-date.js";
import { EventName } from "../../value-objects/event-name.js";
import { FunctionSheetPdf } from "../../value-objects/function-sheet-pdf.js";

/** L'instant des gestes : comparé à lui-même seulement, jamais à l'horloge. */
export const AT = new Date(Date.UTC(2026, 10, 24, 9));
export const LATER = new Date(AT.getTime() + 60_000);

/** Un PDF minimal : la signature suffit au domaine. */
export const PDF_BYTES = Buffer.from("%PDF-1.7\n%fin\n", "latin1");

export function pdf(fileName = "fiche.pdf", bytes: Buffer = PDF_BYTES): FunctionSheetPdf {
  return FunctionSheetPdf.create({ bytes, fileName, declaredContentType: "application/pdf" });
}

export function declaredEvent(name = "Salon du chocolat", date = "2026-12-05"): Event {
  return Event.declare({
    id: "evt_1",
    name: EventName.of(name),
    date: EventDate.fromString(date),
    applications: EventApplications.of(["lafoliecoffee"]),
    createdBy: "staff_1",
    at: AT,
  });
}
