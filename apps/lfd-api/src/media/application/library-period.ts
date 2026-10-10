import { addDays, localToInstant } from "@lfd/contracts";

import { DomainError } from "../../platform/shared/errors/app-error.js";

/** Minuit existe tous les jours à Paris : les bascules d'heure sont à 2 h et 3 h. */
const DAY_START = "00:00";

export class InvalidDepositPeriodError extends DomainError {
  constructor(reason: string) {
    super("media.library.invalid_period", `Période de dépôt refusée : ${reason}`);
  }
}

/** La période en instants : `from` inclus, `before` exclu. */
export interface DepositPeriod {
  readonly from?: Date | undefined;
  readonly before?: Date | undefined;
}

/**
 * **Deux jours nus → deux instants, à l'heure de Paris.**
 *
 * Bornes incluses côté humain : « du 3 au 5 » retient le 5 entier. On le traduit
 * donc en `[début du 3, début du 6[`, la seule forme qui ne perde pas la
 * dernière milliseconde du dernier jour.
 *
 * 🔴 Paris, pas UTC : une image déposée le 3 à 0 h 30 l'est le 2 à 22 h 30 UTC
 * en été, et un filtre en UTC la rangerait la veille (`lint:business-day`).
 *
 * @throws {InvalidDepositPeriodError} jour inexistant, ou `from` après `to`.
 */
export function depositPeriodOf(from: string | undefined, to: string | undefined): DepositPeriod {
  if (from !== undefined && to !== undefined && from > to) {
    throw new InvalidDepositPeriodError(`le premier jour (${from}) est après le dernier (${to}).`);
  }
  return {
    ...(from === undefined ? {} : { from: dayStart(from) }),
    ...(to === undefined ? {} : { before: dayStart(addDays(to, 1)) }),
  };
}

function dayStart(day: string): Date {
  const instant = localToInstant(day, DAY_START);
  if (instant === null) {
    throw new InvalidDepositPeriodError(`le jour ${day} n'existe pas au calendrier.`);
  }
  return instant;
}
