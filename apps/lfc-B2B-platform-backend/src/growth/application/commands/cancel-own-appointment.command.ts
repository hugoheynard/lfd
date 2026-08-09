/**
 * Annulation **par le client** de son propre rendez-vous. Distincte de la
 * transition staff : elle vérifie que le rendez-vous appartient bien au
 * demandeur, et respecte le délai de prévenance (au-delà, il appelle).
 */
export class CancelOwnAppointmentCommand {
  constructor(
    readonly appointmentId: string,
    readonly actorUserId: string,
    readonly companyIds: readonly string[],
  ) {}
}
