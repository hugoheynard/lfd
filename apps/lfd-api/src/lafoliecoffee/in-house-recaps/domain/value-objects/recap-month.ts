import { instantToLocal, localToInstant } from "@lfd/contracts";

import { InvalidRecapMonthError } from "../errors/in-house-recap-errors.js";

const MONTHS_PER_YEAR = 12;
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MIDNIGHT = "00:00";

/** La fenêtre d'un mois : `[from, to[`, deux instants. */
export interface RecapWindow {
  readonly from: Date;
  readonly to: Date;
}

/**
 * **Un mois civil de Paris** — la période d'un récapitulatif
 * (`plan-restaurants-maison.md`, D7, D9). Ses bornes sont les minuits de
 * Paris du 1er et du 1er suivant, convertis par la brique de
 * `lint:business-day` : un BL remis le 1er à 00h30 (heure de Paris) entre dans
 * son mois, pas dans le précédent.
 */
export class RecapMonth {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {}

  /** Depuis la clé `AAAA-MM` ; refuse toute autre forme. */
  static fromKey(key: string): RecapMonth {
    const match = MONTH_KEY.exec(key);
    if (match === null) {
      throw new InvalidRecapMonthError(key);
    }
    return new RecapMonth(Number(match[1]), Number(match[2]));
  }

  /** Le mois de Paris où tombe cet instant. */
  static containing(instant: Date): RecapMonth {
    return RecapMonth.fromKey(instantToLocal(instant).day.slice(0, 7));
  }

  /** Le dernier mois clos à cet instant : celui qui précède le mois en cours à Paris. */
  static lastClosedAt(now: Date): RecapMonth {
    return RecapMonth.containing(now).previous();
  }

  get key(): string {
    return `${String(this.year).padStart(4, "0")}-${String(this.month).padStart(2, "0")}`;
  }

  previous(): RecapMonth {
    return this.month === 1
      ? new RecapMonth(this.year - 1, MONTHS_PER_YEAR)
      : new RecapMonth(this.year, this.month - 1);
  }

  next(): RecapMonth {
    return this.month === MONTHS_PER_YEAR
      ? new RecapMonth(this.year + 1, 1)
      : new RecapMonth(this.year, this.month + 1);
  }

  /** Ce mois vient-il avant l'autre ? */
  isBefore(other: RecapMonth): boolean {
    return this.key < other.key;
  }

  equals(other: RecapMonth): boolean {
    return this.key === other.key;
  }

  /** `[minuit du 1er, minuit du 1er suivant[`, à l'heure de Paris. */
  window(): RecapWindow {
    return { from: firstMidnight(this), to: firstMidnight(this.next()) };
  }

  /** L'instant tombe-t-il dans ce mois ? */
  contains(instant: Date): boolean {
    const { from, to } = this.window();
    return instant.getTime() >= from.getTime() && instant.getTime() < to.getTime();
  }
}

/** Minuit à Paris le 1er du mois — qui existe toujours (les bascules tombent un dimanche à 2 h ou 3 h). */
function firstMidnight(month: RecapMonth): Date {
  const instant = localToInstant(`${month.key}-01`, MIDNIGHT);
  if (instant === null) {
    throw new InvalidRecapMonthError(month.key);
  }
  return instant;
}
