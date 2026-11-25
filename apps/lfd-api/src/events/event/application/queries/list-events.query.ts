/** La table des événements, dans une fenêtre de dates facultative. */
export class ListEventsQuery {
  constructor(
    readonly from: string | null,
    readonly to: string | null,
  ) {}
}
