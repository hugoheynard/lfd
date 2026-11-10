import { addDays } from "@lfd/contracts";

import { InvalidFirstServiceDayError } from "./errors/first-service-day-errors.js";

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Un premier jour commandable**, `AAAA-MM-JJ`, ou `null` pour « aucune
 * restriction » (plan `plan-premier-jour-commandable.md`, 2026-10-28).
 *
 * Une JOURNÉE DE SERVICE, jamais un instant : elle se compare à d'autres
 * journées écrites de la même façon, l'ordre ISO étant l'ordre du calendrier.
 * Une date passée est admise — elle ne restreint plus rien, sans qu'on ait à
 * la vider.
 *
 * @throws {InvalidFirstServiceDayError} la forme n'est pas `AAAA-MM-JJ`, ou le jour n'existe pas.
 */
export function firstServiceDayOf(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  // `addDays(jour, 0)` repasse par le calendrier : un 30 février en ressort
  // 2 mars, et ne se relit donc pas à l'identique (même garde que `CalendarDay`).
  if (!DAY_SHAPE.test(raw) || addDays(raw, 0) !== raw) {
    throw new InvalidFirstServiceDayError(raw);
  }
  return raw;
}
