/** La file **staff** des rendez-vous d'une fenêtre (bornes ISO). */
export class ListAppointmentsQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
