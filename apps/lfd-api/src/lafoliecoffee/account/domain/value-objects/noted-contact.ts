import type { CompanyContactMode } from "@lfd/contracts";

import {
  InvalidNotedContactDateError,
  NotedContactInFutureError,
  NotedContactNoteTooLongError,
} from "../errors/noted-contact-errors.js";

/** Borne haute de la note : une phrase qu'on relit d'un coup d'œil. */
export const NOTED_CONTACT_NOTE_MAX_LENGTH = 280;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * **Un contact noté** avec une société : le mode, le jour de l'échange, et une
 * note courte facultative. C'est ce qui fait passer une fiche au niveau
 * « Contactée » du suivi commercial — un nom et un numéro sans échange noté
 * restent une ligne d'annuaire.
 *
 * Le jour est celui de l'ÉCHANGE, jamais dans le futur : on note ce qui a eu
 * lieu. Il se compare au jour civil de Paris de la requête, reçu en paramètre
 * pour que la règle reste pure.
 */
export class NotedContact {
  private constructor(
    readonly mode: CompanyContactMode,
    readonly date: string,
    /** `null` : aucune note — une note blanche n'en est pas une. */
    readonly note: string | null,
  ) {}

  /**
   * @param today le jour civil de Paris de la requête, `AAAA-MM-JJ`.
   * @throws {InvalidNotedContactDateError} le jour n'existe pas au calendrier.
   * @throws {NotedContactInFutureError} le jour est après `today`.
   * @throws {NotedContactNoteTooLongError} la note dépasse la borne.
   */
  static note(
    input: { readonly mode: CompanyContactMode; readonly date: string; readonly note?: string },
    today: string,
  ): NotedContact {
    if (!isCalendarDay(input.date)) {
      throw new InvalidNotedContactDateError(input.date);
    }
    // Deux jours `AAAA-MM-JJ` se comparent dans l'ordre du texte.
    if (input.date > today) {
      throw new NotedContactInFutureError(input.date, today);
    }
    const note = (input.note ?? "").trim();
    if (note.length > NOTED_CONTACT_NOTE_MAX_LENGTH) {
      throw new NotedContactNoteTooLongError(NOTED_CONTACT_NOTE_MAX_LENGTH);
    }
    return new NotedContact(input.mode, input.date, note === "" ? null : note);
  }
}

function isCalendarDay(raw: string): boolean {
  const match = DAY_PATTERN.exec(raw);
  if (match === null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}
