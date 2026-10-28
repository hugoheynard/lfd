import {
  SERVICE_DAY_BEFORE_FIRST_ORDERABLE_DAY,
  weekdayOf,
  type CustomerAudience,
} from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

const AUDIENCE_NAMES: Readonly<Record<CustomerAudience, string>> = {
  b2b: "des pros",
  b2c: "des particuliers",
};

/** Indexé par `weekdayOf` : 0 = dimanche. */
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * « jeudi 30 octobre » — une journée `AAAA-MM-JJ` dite comme on la lit, sans
 * passer par un instant : le jour du calendrier est déjà le bon.
 */
export function frenchServiceDayOf(day: string): string {
  const [, month, dayOfMonth] = day.split("-").map(Number);
  const weekday = WEEKDAYS[weekdayOf(day)] ?? "";
  const monthName = MONTHS[(month ?? 1) - 1] ?? "";
  // « le 1er mars », comme on l'écrit : l'ordinal n'existe que pour le premier.
  const dayLabel = dayOfMonth === 1 ? "1er" : String(dayOfMonth ?? "");
  return `${weekday} ${dayLabel} ${monthName}`.trim();
}

/**
 * La journée demandée précède le premier jour commandable de la clientèle de
 * qui commande (**409**, plan `plan-premier-jour-commandable.md`, 2026-10-28).
 *
 * Le message nomme la date et le geste de sortie : en choisir une autre. Un
 * GARDE : la boutique ne propose pas de jour plus tôt, et ce refus n'arrive
 * que d'un panier composé avant que la date soit posée, ou d'un appel direct.
 */
export class ServiceDayBeforeFirstOrderableDayError extends BusinessError {
  constructor(
    readonly audience: CustomerAudience,
    readonly firstServiceDay: string,
  ) {
    super(
      SERVICE_DAY_BEFORE_FIRST_ORDERABLE_DAY,
      `Les commandes ${AUDIENCE_NAMES[audience]} sont ouvertes pour le ${frenchServiceDayOf(firstServiceDay)} et les jours suivants. Choisissez cette date ou une suivante.`,
    );
  }
}
