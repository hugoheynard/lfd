import type {
  AppointmentChannel,
  AppointmentPurpose,
  AppointmentStatus,
  AppointmentSubjectType,
  AppointmentTransition,
} from "@lfd/contracts";

import {
  AppointmentTransitionError,
  InvalidAppointmentError,
} from "../errors/appointment-errors.js";
import { addMinutes } from "../paris-time.js";

/**
 * Agrégat **Appointment** — un rendez-vous commercial posé sur un créneau.
 *
 * Pourquoi un agrégat, là où une demande de contact n'en est pas un : **une règle
 * peut refuser cette écriture**. Le créneau peut être dans le passé, l'état peut
 * être terminal, une annulation exige un motif. Ces invariants-là vivent ici, pas
 * dans un handler.
 *
 * Ce que l'agrégat **ne** sait **pas** — et ne doit pas savoir : si le créneau
 * tombe dans une plage déclarée (ça dépend de la configuration, cf. `slotsFor`)
 * et s'il est déjà pris (ça dépend de la base, cf. l'index unique partiel). Le
 * handler compose les trois ; l'agrégat garde ce qui est intrinsèque au
 * rendez-vous lui-même.
 */

/** Transitions autorisées depuis chaque état **actif**. Les autres sont terminaux. */
const ALLOWED: Record<string, ReadonlySet<AppointmentTransition>> = {
  requested: new Set<AppointmentTransition>(["confirmed", "honored", "no_show", "cancelled"]),
  confirmed: new Set<AppointmentTransition>(["honored", "no_show", "cancelled"]),
};

const TEXT_MAX = 2000;
const NAME_MAX = 120;
const PHONE_MAX = 30;
const REASON_MAX = 200;

/** Ce qu'il faut pour poser un rendez-vous, quel qu'en soit l'auteur. */
export interface BookAppointmentInput {
  readonly startAt: Date;
  readonly durationMinutes: number;
  readonly channel: AppointmentChannel;
  /** De quoi on va parler — porté par le rendez-vous, pas déduit du message. */
  readonly purpose: AppointmentPurpose;
  readonly subjectType: AppointmentSubjectType;
  readonly subjectId: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly message: string;
  /** Rendez-vous que celui-ci reprogramme ; `null` dans le cas courant. */
  readonly rescheduledFromId: string | null;
}

/** État sérialisé pour **reconstituer** un rendez-vous persisté. */
export interface ReconstituteAppointmentInput {
  readonly id: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: AppointmentStatus;
  readonly channel: AppointmentChannel;
  readonly purpose: AppointmentPurpose;
  readonly subjectType: AppointmentSubjectType;
  readonly subjectId: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly message: string;
  readonly cancelReason: string;
  readonly rescheduledFromId: string | null;
  readonly createdAt: Date;
}

export class Appointment {
  private constructor(
    private readonly identityId: string | null,
    readonly startAt: Date,
    readonly endAt: Date,
    private statusValue: AppointmentStatus,
    readonly channel: AppointmentChannel,
    readonly purpose: AppointmentPurpose,
    readonly subjectType: AppointmentSubjectType,
    readonly subjectId: string,
    readonly contactName: string,
    readonly contactEmail: string,
    readonly contactPhone: string,
    readonly message: string,
    private cancelReasonValue: string,
    readonly rescheduledFromId: string | null,
  ) {}

  /**
   * Réservation **par le client** : le rendez-vous naît `requested` — il attend
   * une confirmation du commercial.
   */
  static book(input: BookAppointmentInput, now: Date): Appointment {
    return Appointment.create(input, "requested", now);
  }

  /**
   * Pose **par le staff** : il vient d'avoir le prospect au téléphone, donc le
   * rendez-vous naît directement `confirmed` — il n'a personne à attendre.
   */
  static schedule(input: BookAppointmentInput, now: Date): Appointment {
    return Appointment.create(input, "confirmed", now);
  }

  /** Fabrique commune aux deux entrées : valide, puis construit à l'état voulu. */
  private static create(
    input: BookAppointmentInput,
    status: AppointmentStatus,
    now: Date,
  ): Appointment {
    ensureBookable(input, now);
    return new Appointment(
      null,
      input.startAt,
      addMinutes(input.startAt, input.durationMinutes),
      status,
      input.channel,
      input.purpose,
      input.subjectType,
      requiredText(input.subjectId, "Sujet"),
      cleanText(input.contactName, NAME_MAX),
      cleanText(input.contactEmail, NAME_MAX).toLowerCase(),
      cleanText(input.contactPhone, PHONE_MAX),
      cleanText(input.message, TEXT_MAX),
      "",
      input.rescheduledFromId,
    );
  }

  /** Reconstitue un rendez-vous depuis la base (déjà valide). */
  static reconstitute(input: ReconstituteAppointmentInput): Appointment {
    return new Appointment(
      input.id,
      input.startAt,
      input.endAt,
      input.status,
      input.channel,
      input.purpose,
      input.subjectType,
      input.subjectId,
      input.contactName,
      input.contactEmail,
      input.contactPhone,
      input.message,
      input.cancelReason,
      input.rescheduledFromId,
    );
  }

  get id(): string | null {
    return this.identityId;
  }

  get status(): AppointmentStatus {
    return this.statusValue;
  }

  get cancelReason(): string {
    return this.cancelReasonValue;
  }

  /** Vrai si le rendez-vous est **clos** — plus aucune transition possible. */
  get isClosed(): boolean {
    return ALLOWED[this.statusValue] === undefined;
  }

  /**
   * Fait passer le rendez-vous à `target`. Les états terminaux (`honored`,
   * `no_show`, `cancelled`) sont **définitifs** : reprogrammer, c'est annuler
   * puis créer, avec `rescheduledFromId` pour garder le fil.
   *
   * Une **annulation exige un motif** : c'est lui qui rendra le taux d'annulation
   * lisible plus tard, et un motif qu'on ne demande pas au moment du geste ne se
   * retrouve jamais après coup.
   */
  transition(target: AppointmentTransition, reason: string, now: Date): void {
    const allowed = ALLOWED[this.statusValue];
    if (allowed === undefined) {
      throw new AppointmentTransitionError(
        this.statusValue,
        target,
        "le rendez-vous est déjà clos",
      );
    }
    if (!allowed.has(target)) {
      throw new AppointmentTransitionError(this.statusValue, target, "transition non prévue");
    }
    const clean = cleanText(reason, REASON_MAX);
    if (target === "cancelled" && clean === "") {
      throw new InvalidAppointmentError("Motif d'annulation", "obligatoire");
    }
    // On ne déclare pas honoré (ni absent) un rendez-vous qui n'a pas encore eu
    // lieu : ce serait enregistrer un fait qui n'existe pas.
    if ((target === "honored" || target === "no_show") && now < this.startAt) {
      throw new AppointmentTransitionError(
        this.statusValue,
        target,
        "le rendez-vous n'a pas encore eu lieu",
      );
    }
    this.statusValue = target;
    if (target === "cancelled") {
      this.cancelReasonValue = clean;
    }
  }
}

/** Les invariants intrinsèques d'une réservation, avant toute construction. */
function ensureBookable(input: BookAppointmentInput, now: Date): void {
  if (Number.isNaN(input.startAt.getTime())) {
    throw new InvalidAppointmentError("Créneau", "instant invalide");
  }
  if (input.startAt <= now) {
    throw new InvalidAppointmentError("Créneau", "on ne réserve pas dans le passé");
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new InvalidAppointmentError("Durée", "doit être un nombre de minutes positif");
  }
}

function cleanText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function requiredText(value: string, field: string): string {
  const clean = cleanText(value, NAME_MAX);
  if (clean === "") {
    throw new InvalidAppointmentError(field, "obligatoire");
  }
  return clean;
}
