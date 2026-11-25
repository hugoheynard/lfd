/** **Archiver un événement** : il sort de la table et ne bouge plus. */
export class ArchiveEventCommand {
  constructor(readonly eventId: string) {}
}
