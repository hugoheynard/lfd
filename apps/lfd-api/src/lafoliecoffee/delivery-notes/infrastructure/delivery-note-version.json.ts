import { clientNoteSchema } from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  DELIVERY_NOTE_VERSION_CAUSES,
  type DeliveryNoteVersionCause,
} from "../domain/services/delivery-note-version.js";
import type { RenderedClientNote } from "../domain/services/rendered-client-note.js";

/** La forme rangée dans `rendered` : `{ note, undelivered }`. */
const renderedSchema = z.object({
  note: clientNoteSchema,
  undelivered: z.array(
    z.object({
      productName: z.string(),
      quantity: z.number().int().nonnegative(),
      saleUnit: z.enum(["piece", "weight"]),
    }),
  ),
});

/** Une version rangée ne se relit pas telle qu'elle a été écrite. */
export class DeliveryNoteVersionUnreadableError extends TechnicalError {
  constructor(noteId: string, version: number) {
    super(
      "delivery_notes.version.unreadable",
      `La version ${String(version)} du bon ${noteId} ne se relit pas telle qu'elle a été figée ` +
        "(champ inconnu ou forme changée) : son PDF n'est pas rendu, plutôt qu'un papier différent " +
        "de celui qui est sorti. Signalez-le à l'équipe technique.",
    );
  }
}

/** Le BL composé porte un champ que le schéma du contrat ne sait pas ranger. */
export class DeliveryNoteVersionShapeError extends TechnicalError {
  constructor(number: string) {
    super(
      "delivery_notes.version.shape",
      `Le bon de livraison ${number} ne peut pas être figé : sa composition porte un champ que le ` +
        "schéma du BL client (`clientNoteSchema`) ne connaît pas. Le bon n'a pas été écrit ; " +
        "signalez-le à l'équipe technique (le schéma est à compléter).",
    );
  }
}

/**
 * L'entrée du rendu, en JSON — telle quelle : rien n'est recalculé. Un champ
 * que le schéma du contrat ne connaît pas serait perdu à l'écriture : la
 * version est alors refusée, et l'écriture du bon avec elle, plutôt que
 * figée amputée.
 *
 * @throws {DeliveryNoteVersionShapeError}
 */
export function renderedJson(rendered: RenderedClientNote): Prisma.InputJsonValue {
  const parsed = renderedSchema.safeParse(rendered);
  if (!parsed.success || canonical(parsed.data) !== canonical(rendered)) {
    throw new DeliveryNoteVersionShapeError(rendered.note.number);
  }
  return parsed.data;
}

/**
 * Relit une version rangée. Le schéma ne garde que les champs qu'il connaît ;
 * une version qui en porte d'autres est REFUSÉE plutôt que rendue amputée.
 *
 * @throws {DeliveryNoteVersionUnreadableError}
 */
export function renderedOf(
  noteId: string,
  version: number,
  raw: Prisma.JsonValue,
): RenderedClientNote {
  if (!isRendered(raw)) {
    throw new DeliveryNoteVersionUnreadableError(noteId, version);
  }
  return raw;
}

/** Le schéma l'admet, et ne lui retire rien : c'est l'entrée telle qu'elle a été figée. */
function isRendered(raw: unknown): raw is RenderedClientNote {
  const parsed = renderedSchema.safeParse(raw);
  return parsed.success && canonical(parsed.data) === canonical(raw);
}

/** Une cause rangée ; une valeur hors du CHECK est une écriture hors de l'application. */
export function causeOf(noteId: string, version: number, raw: string): DeliveryNoteVersionCause {
  const cause = DELIVERY_NOTE_VERSION_CAUSES.find((known) => known === raw);
  if (cause === undefined) {
    throw new DeliveryNoteVersionUnreadableError(noteId, version);
  }
  return cause;
}

/** Une écriture stable d'une valeur JSON : clés triées, `undefined` omis. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}
