import type { Appointment } from "../entities/appointment.js";

/**
 * Port sortant : **prévenir l'équipe** qu'un client vient de prendre
 * rendez-vous.
 *
 * Un port plutôt qu'un appel au mailer depuis le handler : réserver et prévenir
 * sont deux raisons de changer, et la réservation se teste sans fournisseur
 * d'e-mail.
 *
 * Contrat : **best-effort**. Une panne est journalisée par l'adaptateur et ne
 * remonte pas — le rendez-vous est déjà en base, et refuser la réservation
 * parce qu'un courriel n'est pas parti serait absurde.
 */
export abstract class AppointmentBookedAlert {
  /**
   * @param appointmentId l'identifiant rendu par la persistance — l'agrégat
   *   neuf n'en porte pas encore.
   */
  abstract notify(appointmentId: string, appointment: Appointment): Promise<void>;
}
