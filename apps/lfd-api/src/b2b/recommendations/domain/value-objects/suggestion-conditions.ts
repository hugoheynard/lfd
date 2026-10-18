import {
  minutesOfDay,
  STAFF_SUGGESTION_WEEKDAYS,
  type StaffSuggestionConditions,
  type StaffSuggestionPlacement,
  type Weekday,
} from "@lfd/contracts";

import {
  InvalidSuggestionCartThresholdError,
  InvalidSuggestionHourError,
  InvalidSuggestionSitesError,
  InvalidSuggestionWeekdaysError,
  SuggestionCartConditionPlacementError,
  SuggestionHoursReversedError,
} from "../errors/suggestion-condition-errors.js";

/** Le plus haut seuil de panier admis : 10 000 €, au-delà c'est une faute de frappe. */
export const MAX_SUGGESTION_CART_THRESHOLD_CENTS = 1_000_000;

/** Combien de points de retrait une règle peut nommer : au-delà, autant n'en nommer aucun. */
export const MAX_SUGGESTION_SITES = 20;

const HOUR_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** Une plage d'heures locales (Paris) : début compris, fin exclue, sans passer minuit. */
export interface SuggestionHours {
  readonly from: string;
  readonly to: string;
}

/**
 * **Les conditions facultatives d'une règle** (RS8), toutes en ET avec le
 * reste : `null` = la condition n'est pas posée.
 */
export interface SuggestionConditions {
  /** Dans l'ordre de la semaine, lundi d'abord ; jamais les sept (ce serait « tous »). */
  readonly weekdays: readonly Weekday[] | null;
  readonly hours: SuggestionHours | null;
  /** Centimes entiers, comparés au total que le client lit au panier. */
  readonly minCartTotalCents: number | null;
  readonly cartWithoutFamilyId: string | null;
  readonly pickupAddressIds: readonly string[] | null;
}

/** Ce que le staff pose, à juger. */
export interface SuggestionConditionsInput {
  readonly weekdays: readonly string[] | null;
  readonly hours: SuggestionHours | null;
  readonly minCartTotalCents: number | null;
  readonly cartWithoutFamilyId: string | null;
  readonly pickupAddressIds: readonly string[] | null;
}

export const NO_SUGGESTION_CONDITIONS: SuggestionConditions = {
  weekdays: null,
  hours: null,
  minCartTotalCents: null,
  cartWithoutFamilyId: null,
  pickupAddressIds: null,
};

/**
 * Juge les conditions d'une règle posée à `placement`. Le panier seul connaît
 * son montant et ses familles : ses deux conditions n'y valent qu'au panier.
 *
 * @throws {InvalidSuggestionWeekdaysError}
 * @throws {InvalidSuggestionHourError}
 * @throws {SuggestionHoursReversedError}
 * @throws {InvalidSuggestionCartThresholdError}
 * @throws {SuggestionCartConditionPlacementError}
 * @throws {InvalidSuggestionSitesError}
 */
export function suggestionConditions(
  input: SuggestionConditionsInput,
  placement: StaffSuggestionPlacement,
): SuggestionConditions {
  const conditions: SuggestionConditions = {
    weekdays: input.weekdays === null ? null : weekdaysOf(input.weekdays),
    hours: input.hours === null ? null : hoursOf(input.hours),
    minCartTotalCents:
      input.minCartTotalCents === null ? null : thresholdOf(input.minCartTotalCents),
    cartWithoutFamilyId: blankToNull(input.cartWithoutFamilyId),
    pickupAddressIds: input.pickupAddressIds === null ? null : sitesOf(input.pickupAddressIds),
  };
  if (placement !== "cart" && conditions.minCartTotalCents !== null) {
    throw new SuggestionCartConditionPlacementError("threshold");
  }
  if (placement !== "cart" && conditions.cartWithoutFamilyId !== null) {
    throw new SuggestionCartConditionPlacementError("family");
  }
  return conditions;
}

function weekdaysOf(raw: readonly string[]): readonly Weekday[] | null {
  if (raw.length === 0) {
    throw new InvalidSuggestionWeekdaysError("empty", "");
  }
  const seen = new Set<string>();
  for (const day of raw) {
    if (!STAFF_SUGGESTION_WEEKDAYS.some((known) => known === day)) {
      throw new InvalidSuggestionWeekdaysError("unknown", day);
    }
    if (seen.has(day)) {
      throw new InvalidSuggestionWeekdaysError("duplicate", day);
    }
    seen.add(day);
  }
  // Les sept jours ne restreignent rien : la condition n'est pas posée.
  const days = STAFF_SUGGESTION_WEEKDAYS.filter((day) => seen.has(day));
  return days.length === STAFF_SUGGESTION_WEEKDAYS.length ? null : days;
}

function hoursOf(raw: SuggestionHours): SuggestionHours {
  if (!HOUR_SHAPE.test(raw.from)) {
    throw new InvalidSuggestionHourError("Le début de la plage", raw.from);
  }
  if (!HOUR_SHAPE.test(raw.to)) {
    throw new InvalidSuggestionHourError("La fin de la plage", raw.to);
  }
  // `HH:MM` à deux chiffres : l'ordre des chaînes est celui des heures.
  if (raw.to <= raw.from) {
    throw new SuggestionHoursReversedError(raw.from, raw.to);
  }
  return { from: raw.from, to: raw.to };
}

function thresholdOf(cents: number): number {
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_SUGGESTION_CART_THRESHOLD_CENTS) {
    throw new InvalidSuggestionCartThresholdError(cents, MAX_SUGGESTION_CART_THRESHOLD_CENTS);
  }
  return cents;
}

function sitesOf(raw: readonly string[]): readonly string[] {
  const ids = raw.map((id) => id.trim()).filter((id) => id !== "");
  if (ids.length === 0) {
    throw new InvalidSuggestionSitesError("empty", "", MAX_SUGGESTION_SITES);
  }
  if (ids.length > MAX_SUGGESTION_SITES) {
    throw new InvalidSuggestionSitesError("too_many", "", MAX_SUGGESTION_SITES);
  }
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    throw new InvalidSuggestionSitesError("duplicate", duplicate, MAX_SUGGESTION_SITES);
  }
  return ids;
}

function blankToNull(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Une copie à plat, pour la vue et le journal : des listes neuves, rien de partagé. */
export function plainConditions(conditions: SuggestionConditions): StaffSuggestionConditions {
  return {
    weekdays: conditions.weekdays === null ? null : [...conditions.weekdays],
    hours: conditions.hours === null ? null : { ...conditions.hours },
    minCartTotalCents: conditions.minCartTotalCents,
    cartWithoutFamilyId: conditions.cartWithoutFamilyId,
    pickupAddressIds:
      conditions.pickupAddressIds === null ? null : [...conditions.pickupAddressIds],
  };
}

/** L'heure `HH:MM` est-elle dans la plage — début compris, fin exclue ? */
export function hoursCover(hours: SuggestionHours, time: string): boolean {
  const minute = minutesOfDay(time);
  return minutesOfDay(hours.from) <= minute && minute < minutesOfDay(hours.to);
}
