/** Un rendez-vous par son identifiant — ce que lit sa page dédiée. */
export class GetAppointmentQuery {
  constructor(readonly appointmentId: string) {}
}
