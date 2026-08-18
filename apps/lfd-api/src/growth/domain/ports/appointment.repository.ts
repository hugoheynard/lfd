import type { Appointment } from "../entities/appointment.js";
import type { BookedSlot } from "../availability.js";

/**
 * Port d'**écriture** de l'agrégat Appointment (surface séparée de la lecture,
 * cf. `AppointmentReader` — ISP).
 *
 * `create` peut échouer sur la **course au créneau** : l'index unique partiel
 * de la base est la seule garantie d'exclusivité qui tienne sous concurrence.
 * L'adaptateur traduit cette violation en `SlotAlreadyTakenError` (409) — le
 * port promet donc de lever une erreur métier, pas une erreur Prisma.
 */
export abstract class AppointmentRepository {
  /**
   * Persiste un rendez-vous et rend son id (ULID préfixé `appt_`).
   * @throws SlotAlreadyTakenError si le créneau vient d'être pris.
   */
  abstract create(appointment: Appointment): Promise<string>;

  /** Charge l'agrégat à muter, ou `null` s'il n'existe pas. */
  abstract load(appointmentId: string): Promise<Appointment | null>;

  /** Persiste l'état d'un agrégat chargé (statut, motif d'annulation). */
  abstract save(appointmentId: string, appointment: Appointment): Promise<void>;

  /**
   * Les créneaux **occupés** qui chevauchent la fenêtre — ce que `slotsFor`
   * retranche. Les rendez-vous annulés n'en font pas partie : ils ont libéré
   * leur créneau.
   */
  abstract bookedBetween(from: Date, to: Date): Promise<readonly BookedSlot[]>;
}
