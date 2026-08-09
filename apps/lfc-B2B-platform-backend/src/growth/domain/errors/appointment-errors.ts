import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../shared/errors/app-error.js";

/** Donnée de rendez-vous mal formée (le modèle se protège lui-même — 400). */
export class InvalidAppointmentError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("growth.appointment.invalid", `${field} : ${reason}`);
  }
}

/**
 * Le créneau visé n'est **pas réservable** (409) : hors des plages déclarées,
 * sous le délai de prévenance, au-delà de l'horizon, ou dans le passé. La demande
 * est valide dans sa forme — c'est l'état de la disponibilité qui la refuse.
 */
export class SlotNotBookableError extends BusinessError {
  constructor(readonly startAt: string) {
    super(
      "growth.appointment.slot_not_bookable",
      `Le créneau du ${startAt} n'est pas réservable (hors disponibilité, trop proche ou trop lointain).`,
    );
  }
}

/**
 * Le créneau vient d'être pris par quelqu'un d'autre (409). Distinct de
 * {@link SlotNotBookableError} : ici le créneau était bon, la course l'a perdu.
 * Le front doit **recharger** les créneaux, pas afficher « réglage invalide ».
 */
export class SlotAlreadyTakenError extends BusinessError {
  constructor(readonly startAt: string) {
    super(
      "growth.appointment.slot_taken",
      `Le créneau du ${startAt} vient d'être réservé. Choisissez-en un autre.`,
    );
  }
}

/**
 * Transition d'état refusée (409). Les états `honored` / `no_show` / `cancelled`
 * sont **terminaux** : on ne ressuscite pas un rendez-vous, on en crée un autre.
 */
export class AppointmentTransitionError extends BusinessError {
  constructor(
    readonly from: string,
    readonly to: string,
    reason: string,
  ) {
    super("growth.appointment.transition", `Transition ${from} → ${to} refusée : ${reason}`);
  }
}

/** Le rendez-vous visé n'existe pas (404). */
export class AppointmentNotFoundError extends ResourceNotFoundError {
  constructor(readonly appointmentId: string) {
    super("growth.appointment.not_found", `Rendez-vous « ${appointmentId} » introuvable.`);
  }
}

/**
 * Le demandeur n'est pas rattaché à la société visée. **404 non-divulguant**,
 * pas 403 : on ne confirme pas l'existence d'une société à quelqu'un qui n'en
 * est pas membre (même convention que `ensureCompanyMember` côté compte).
 */
export class AppointmentSubjectNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("growth.appointment.subject_not_found", `Société « ${companyId} » introuvable.`);
  }
}
