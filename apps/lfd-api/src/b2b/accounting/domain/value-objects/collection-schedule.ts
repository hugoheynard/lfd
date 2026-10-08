import {
  CollectionBeforeNoticeError,
  InvalidCollectionScheduleError,
} from "../errors/collection-schedule-errors.js";

/**
 * Le délai entre la clôture et la constitution automatique, en heures.
 *
 * 🔴 **Au plus 23**, et la borne porte une règle : la clôture tombe à 00h00
 * locales, et l'avis part à la constitution. Tant que la constitution reste
 * le JOUR de la clôture, « clôture + N jours ≥ délai de pré-notification »
 * suffit à garantir le préavis en jours de calendrier. Un délai de 30 h
 * rognerait le préavis d'un jour sans que la règle ci-dessous le voie.
 * Au moins 1 : laisser passer le cron de minuit (plan
 * `prelevement-automatique.md`, § 3).
 */
export const AUTO_COLLECTION_DELAY_DEFAULT_HOURS = 1;
export const AUTO_COLLECTION_DELAY_MIN_HOURS = 1;
export const AUTO_COLLECTION_DELAY_MAX_HOURS = 23;

/** L'échéance au plus loin : deux mois, la borne haute du délai de pré-notification. */
export const COLLECTION_DAYS_MAX = 60;

/**
 * Le cut-off de dépôt : au plus tard N jours ouvrés TARGET2 avant l'échéance.
 * Au moins 1 — un dépôt le jour même de l'échéance n'existe pas en SEPA.
 */
export const DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS = 1;
export const DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS = 10;

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * **La date limite de dépôt du portail bancaire** : un nombre de jours ouvrés
 * avant l'échéance, et une heure locale ce jour-là.
 *
 * C'est la forme sous laquelle les banques énoncent un cut-off (« J−2 ouvrés,
 * 16h »). Elle reste à renseigner : la valeur de la Caisse d'Épargne n'est pas
 * connue (`prelevement-sepa.md`, question 3), et une valeur inventée serait
 * pire qu'un « à renseigner » affiché.
 */
export interface DepositCutoff {
  readonly businessDaysBefore: number;
  /** `HH:MM`, heure de Paris. */
  readonly time: string;
}

export interface CollectionScheduleInput {
  readonly delayHours: number;
  /** `null` = égal au délai de pré-notification, quel qu'il soit. */
  readonly daysAfterClosure: number | null;
  readonly depositCutoff: DepositCutoff | null;
}

/**
 * **Le calendrier de prélèvement d'une entité** — quand constituer, quand
 * prélever, jusqu'à quand déposer.
 *
 * Ses bornes propres sont ici ; la règle qui le lie au délai de
 * pré-notification vit sur l'entité, qui seule voit les deux
 * ({@link assertCollectionAfterNotice}).
 */
export class CollectionSchedule {
  private constructor(
    readonly delayHours: number,
    readonly daysAfterClosure: number | null,
    readonly depositCutoff: DepositCutoff | null,
  ) {}

  /** Ce que porte une entité qui n'a rien réglé : rien ne change pour l'existant. */
  static initial(): CollectionSchedule {
    return new CollectionSchedule(AUTO_COLLECTION_DELAY_DEFAULT_HOURS, null, null);
  }

  /** @throws {InvalidCollectionScheduleError} une valeur hors de ses bornes. */
  static create(input: CollectionScheduleInput): CollectionSchedule {
    requireIntegerBetween(
      input.delayHours,
      AUTO_COLLECTION_DELAY_MIN_HOURS,
      AUTO_COLLECTION_DELAY_MAX_HOURS,
      "Délai de constitution après la clôture",
      "heures",
    );
    if (input.daysAfterClosure !== null) {
      requireIntegerBetween(
        input.daysAfterClosure,
        1,
        COLLECTION_DAYS_MAX,
        "Échéance après la clôture",
        "jours",
      );
    }
    return new CollectionSchedule(
      input.delayHours,
      input.daysAfterClosure,
      input.depositCutoff === null ? null : depositCutoffOf(input.depositCutoff),
    );
  }

  /** N : l'échéance, en jours après la clôture, une fois le défaut résolu. */
  collectionDays(preNotificationDays: number): number {
    return this.daysAfterClosure ?? preNotificationDays;
  }

  equals(other: CollectionSchedule): boolean {
    return (
      this.delayHours === other.delayHours &&
      this.daysAfterClosure === other.daysAfterClosure &&
      this.depositCutoff?.businessDaysBefore === other.depositCutoff?.businessDaysBefore &&
      this.depositCutoff?.time === other.depositCutoff?.time
    );
  }
}

/**
 * **N ≥ délai de pré-notification**, ou refus. Un N non réglé vaut le délai,
 * et ne peut donc jamais le contredire.
 *
 * @throws {CollectionBeforeNoticeError} l'échéance précéderait le préavis.
 */
export function assertCollectionAfterNotice(
  daysAfterClosure: number | null,
  preNotificationDays: number,
): void {
  if (daysAfterClosure !== null && daysAfterClosure < preNotificationDays) {
    throw new CollectionBeforeNoticeError(daysAfterClosure, preNotificationDays);
  }
}

function depositCutoffOf(cutoff: DepositCutoff): DepositCutoff {
  requireIntegerBetween(
    cutoff.businessDaysBefore,
    DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS,
    DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS,
    "Date limite de dépôt",
    "jours ouvrés avant l'échéance",
  );
  if (!CLOCK_TIME.test(cutoff.time)) {
    throw new InvalidCollectionScheduleError(
      "Heure limite de dépôt",
      `« ${cutoff.time} » n'est pas une heure HH:MM`,
    );
  }
  return { businessDaysBefore: cutoff.businessDaysBefore, time: cutoff.time };
}

function requireIntegerBetween(
  value: number,
  min: number,
  max: number,
  field: string,
  unit: string,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InvalidCollectionScheduleError(
      field,
      `entier entre ${String(min)} et ${String(max)} ${unit} attendu, reçu ${String(value)}`,
    );
  }
}
