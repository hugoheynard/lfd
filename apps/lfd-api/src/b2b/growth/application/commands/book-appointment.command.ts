import type { BookAppointmentPayload } from "@lfd/contracts";

/**
 * Réservation **par le client**. Porte l'identité du demandeur et ses
 * rattachements : c'est le handler qui décide du sujet du rendez-vous et vérifie
 * le mur, pas le contrôleur.
 */
export class BookAppointmentCommand {
  constructor(
    readonly actorUserId: string,
    readonly actorEmail: string,
    readonly companyIds: readonly string[],
    readonly payload: BookAppointmentPayload,
  ) {}
}
