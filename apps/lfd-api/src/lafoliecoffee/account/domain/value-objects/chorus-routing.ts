import { InvalidChorusRoutingError } from "../errors/account-errors.js";
import type { StaffTrace } from "./staff-trace.js";

/** Un code service Chorus Pro tient en 100 caractères. */
const SERVICE_CODE_MAX_LENGTH = 100;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Ce que le staff relève dans l'annuaire Chorus Pro. */
export interface ChorusRoutingInput {
  readonly commitmentRequired: boolean;
  readonly serviceCodeRequired: boolean;
  readonly defaultServiceCode: string;
  /** `AAAA-MM-JJ`. */
  readonly checkedOn: string;
}

/**
 * **La fiche Chorus Pro** d'un organisme public : engagement exigé ou non,
 * code service exigé ou non et son défaut, et la parole de l'agent qui l'a
 * relevée dans l'annuaire. Un code exigé sans défaut est permis : il se
 * saisira à la commande.
 *
 * Immuable et auto-validée. Elle ne sait pas si la société est publique :
 * c'est `Company.acceptChorusRouting` qui en décide.
 */
export class ChorusRouting {
  private constructor(
    readonly commitmentRequired: boolean,
    readonly serviceCodeRequired: boolean,
    readonly defaultServiceCode: string,
    readonly checkedOn: string,
    readonly checkedBy: StaffTrace,
  ) {}

  /**
   * Une fiche relevée par un agent.
   *
   * @throws {InvalidChorusRoutingError} code service trop long, ou date du
   *   relevé qui n'est pas un jour du calendrier.
   */
  static record(input: ChorusRoutingInput, checkedBy: StaffTrace): ChorusRouting {
    return new ChorusRouting(
      input.commitmentRequired,
      input.serviceCodeRequired,
      serviceCode(input.defaultServiceCode),
      calendarDay(input.checkedOn),
      checkedBy,
    );
  }

  /** Relit une fiche rangée : mêmes règles qu'à la saisie. */
  static reconstitute(input: ChorusRoutingInput, checkedBy: StaffTrace): ChorusRouting {
    return ChorusRouting.record(input, checkedBy);
  }

  /**
   * Même relevé, à l'auteur près : reposer la même fiche n'est pas un geste
   * neuf, et ne réécrit pas qui l'a relevée.
   */
  sameReadingAs(other: ChorusRouting): boolean {
    return (
      this.commitmentRequired === other.commitmentRequired &&
      this.serviceCodeRequired === other.serviceCodeRequired &&
      this.defaultServiceCode === other.defaultServiceCode &&
      this.checkedOn === other.checkedOn
    );
  }
}

function serviceCode(raw: string): string {
  const value = raw.trim();
  if (value.length > SERVICE_CODE_MAX_LENGTH) {
    throw new InvalidChorusRoutingError(
      "code service",
      `au plus ${String(SERVICE_CODE_MAX_LENGTH)} caractères`,
    );
  }
  return value;
}

function calendarDay(raw: string): string {
  const value = raw.trim();
  const match = DAY_PATTERN.exec(value);
  if (match === null) {
    throw new InvalidChorusRoutingError("date du relevé", "attendue au format AAAA-MM-JJ");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > MONTHS_IN_YEAR || day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidChorusRoutingError(
      "date du relevé",
      `« ${value} » n'est pas un jour du calendrier`,
    );
  }
  return value;
}

const MONTHS_IN_YEAR = 12;
const FEBRUARY = 2;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === FEBRUARY && leap ? 29 : (MONTH_LENGTHS[month - 1] ?? 0);
}
