/** **Changer le nom, la date, ou les deux** d'un événement. */
export class ReviseEventCommand {
  constructor(
    readonly eventId: string,
    readonly name: string | null,
    /** `AAAA-MM-JJ`, ou `null` pour garder la date. */
    readonly date: string | null,
  ) {}
}
