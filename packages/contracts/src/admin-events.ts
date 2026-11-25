import { z } from "zod";

/**
 * **Les événements et leurs fiches de fonction** — le contrat des routes
 * `/admin/events` (`documentation/evenements/plan-evenements.md`, E1–E2).
 *
 * Le contrat ne tient que la FORME : un nom vide, une date qui n'existe pas
 * (30 février) ou une fiche qui n'est pas un PDF sont refusés par le domaine,
 * avec un message qui dit quoi faire.
 */

/** **20 Mo** par fiche — copie de la borne du domaine ; un test tient la parité. */
export const EVENT_FUNCTION_SHEET_MAX_BYTES = 20 * 1024 * 1024;

/** Le champ multipart qui porte la fiche. */
export const EVENT_FUNCTION_SHEET_FIELD = "file";

const isoDay = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ");

/** Une borne de saisie, pas une règle : le domaine refuse le nom vide. */
const EVENT_NAME_MAX = 200;

/** La table : une fenêtre de dates facultative, bornes comprises. */
export const listEventsQuerySchema = z.object({
  from: isoDay().optional(),
  to: isoDay().optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

/** « Créer un événement » : le popover (nom + date). */
export const createEventPayloadSchema = z.object({
  name: z.string().max(EVENT_NAME_MAX),
  date: isoDay(),
});
export type CreateEventPayload = z.infer<typeof createEventPayloadSchema>;

/** Le nom, la date, ou les deux — au moins l'un. */
export const reviseEventPayloadSchema = z
  .object({
    name: z.string().max(EVENT_NAME_MAX).optional(),
    date: isoDay().optional(),
  })
  .refine((payload) => payload.name !== undefined || payload.date !== undefined, {
    message: "indiquer le nom, la date, ou les deux",
  });
export type ReviseEventPayload = z.infer<typeof reviseEventPayloadSchema>;

/** Une ligne de la table. */
export interface EventSummaryView {
  readonly id: string;
  readonly name: string;
  /** `AAAA-MM-JJ`, le jour de l'événement. */
  readonly date: string;
  readonly applications: readonly string[];
  /** Les fiches en vigueur — les retirées ne comptent pas. */
  readonly functionSheetCount: number;
}

/** Une fiche de fonction en vigueur. */
export interface FunctionSheetView {
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
  /** ISO 8601. */
  readonly uploadedAt: string;
}

/** Le détail d'un événement et ses fiches, dans l'ordre de dépôt. */
export interface EventDetailView {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly applications: readonly string[];
  /** ISO 8601, ou `null` tant que l'événement est en vigueur. */
  readonly archivedAt: string | null;
  readonly functionSheets: readonly FunctionSheetView[];
}

export interface EventCreated {
  readonly id: string;
}

export interface FunctionSheetUploaded {
  readonly id: string;
}
