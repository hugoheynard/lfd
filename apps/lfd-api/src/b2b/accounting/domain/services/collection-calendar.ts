import { addDays, instantToLocal } from "@lfd/contracts";

import type { DepositCutoff } from "../value-objects/collection-schedule.js";
import { businessDaysBefore, onOrAfterBusinessDay } from "./target2-calendar.js";

const HOUR_MS = 3_600_000;

/** Ce que le calendrier lit de l'entité — des nombres, pas l'agrégat. */
export interface CollectionCalendarSettings {
  readonly preNotificationDays: number;
  /** N ; `null` = égal au délai de pré-notification. */
  readonly collectionDaysAfterClosure: number | null;
  readonly autoCollectionDelayHours: number;
  readonly depositCutoff: DepositCutoff | null;
}

/** Une limite locale : un jour et une heure de Paris, sans conversion. */
export interface LocalDeadline {
  readonly day: string;
  readonly time: string;
}

/**
 * Le calendrier d'UN cycle. Le plan : `plan-prelevement-automatique.md`, § 3.
 */
export interface CollectionCalendar {
  readonly closesAt: Date;
  /** La clôture plus le délai de l'automatisme — qu'il soit activé ou non. */
  readonly plannedConstitutionAt: Date;
  /** L'échéance (`ReqdColltnDt`), jour ouvré TARGET2. */
  readonly collectionDay: string;
  /** `null` tant que le cut-off du portail n'est pas renseigné. */
  readonly depositDeadline: LocalDeadline | null;
}

/**
 * **Le calendrier d'un cycle de prélèvement**, à partir de sa clôture.
 *
 * Pur : ni horloge, ni port. La clôture est donnée, les réglages aussi.
 */
export function collectionCalendar(
  closure: Date,
  settings: CollectionCalendarSettings,
): CollectionCalendar {
  const collectionDay = collectionDayOf(
    closure,
    settings.preNotificationDays,
    settings.collectionDaysAfterClosure,
  );
  return {
    closesAt: closure,
    plannedConstitutionAt: new Date(
      closure.getTime() + settings.autoCollectionDelayHours * HOUR_MS,
    ),
    collectionDay,
    depositDeadline: depositDeadlineOf(collectionDay, settings.depositCutoff),
  };
}

/**
 * L'échéance : le jour LOCAL de la clôture, plus N jours de calendrier, reporté
 * au premier jour ouvré TARGET2.
 *
 * N par défaut = le délai de pré-notification : c'est ce que le fichier
 * portait avant ce calendrier (clôture + délai, jours calendaires), et la
 * seule différence pour un lot constitué après le déploiement est donc le
 * report d'un jour fermé au suivant.
 */
export function collectionDayOf(
  closure: Date,
  preNotificationDays: number,
  collectionDaysAfterClosure: number | null,
): string {
  const days = collectionDaysAfterClosure ?? preNotificationDays;
  return onOrAfterBusinessDay(addDays(instantToLocal(closure).day, days));
}

/**
 * La date limite de dépôt d'une échéance : k jours ouvrés TARGET2 avant elle,
 * à l'heure dite. `null` si le cut-off n'est pas renseigné — jamais une
 * valeur inventée.
 */
export function depositDeadlineOf(
  collectionDay: string,
  cutoff: DepositCutoff | null,
): LocalDeadline | null {
  if (cutoff === null) {
    return null;
  }
  return { day: businessDaysBefore(collectionDay, cutoff.businessDaysBefore), time: cutoff.time };
}
