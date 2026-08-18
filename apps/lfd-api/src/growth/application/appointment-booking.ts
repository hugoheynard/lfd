import type { AppointmentSubjectType } from "@lfd/contracts";

import type { AvailabilityConfig, BookedSlot } from "../domain/availability.js";
import { isBookableSlot } from "../domain/availability.js";
import {
  AppointmentSubjectNotFoundError,
  InvalidAppointmentError,
  SlotNotBookableError,
} from "../domain/errors/appointment-errors.js";
import type { AppointmentRepository } from "../domain/ports/appointment.repository.js";

/**
 * Ce que **partagent** les deux chemins de réservation (client et staff) : lire
 * les créneaux occupés autour d'un instant, et revalider que le créneau est bien
 * ouvert. Écrit une fois, pas deux — les deux handlers doivent appliquer
 * exactement la même règle, sinon l'un des deux finira par diverger.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** L'instant demandé, ou une erreur lisible si la chaîne n'en est pas un. */
export function parseStartAt(value: string): Date {
  const startAt = new Date(value);
  if (Number.isNaN(startAt.getTime())) {
    throw new InvalidAppointmentError("Créneau", "instant invalide");
  }
  return startAt;
}

/**
 * Les rendez-vous qui occupent le voisinage de `startAt`. Une fenêtre de ±1 jour
 * suffit et couvre largement la journée locale, quel que soit le fuseau.
 */
export function bookedAround(
  repository: AppointmentRepository,
  startAt: Date,
): Promise<readonly BookedSlot[]> {
  return repository.bookedBetween(
    new Date(startAt.getTime() - DAY_MS),
    new Date(startAt.getTime() + DAY_MS),
  );
}

/**
 * **La revalidation serveur.** La liste de créneaux envoyée au client a pu
 * vieillir (plage fermée, rendez-vous pris) : on ne fait jamais confiance à
 * l'instant reçu, on le recalcule contre `slotsFor`.
 */
export function ensureBookable(
  startAt: Date,
  config: AvailabilityConfig,
  taken: readonly BookedSlot[],
  now: Date,
): void {
  if (!isBookableSlot(startAt, config, taken, now)) {
    throw new SlotNotBookableError(startAt.toISOString());
  }
}

/** Le sujet d'un rendez-vous client : sa société s'il en désigne une, sinon lui. */
export function resolveSubject(
  companyId: string | null,
  actorUserId: string,
  companyIds: readonly string[],
): { type: AppointmentSubjectType; id: string } {
  if (companyId === null) {
    return { type: "user", id: actorUserId };
  }
  // Mur de tenancy : on ne pose pas un rendez-vous sur une société dont le
  // demandeur n'est pas membre. 404 non-divulguant, pas 403.
  if (!companyIds.includes(companyId)) {
    throw new AppointmentSubjectNotFoundError(companyId);
  }
  return { type: "company", id: companyId };
}

/** Le demandeur est-il le propriétaire de ce rendez-vous ? */
export function ownsAppointment(
  subjectType: AppointmentSubjectType,
  subjectId: string,
  actorUserId: string,
  companyIds: readonly string[],
): boolean {
  if (subjectType === "user") {
    return subjectId === actorUserId;
  }
  if (subjectType === "company") {
    return companyIds.includes(subjectId);
  }
  // Un rendez-vous rattaché à un lead n'appartient à aucun compte client.
  return false;
}
