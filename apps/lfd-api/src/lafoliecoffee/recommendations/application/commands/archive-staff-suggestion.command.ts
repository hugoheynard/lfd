/** **Archiver une suggestion** : retirée pour toujours, jamais supprimée. */
export class ArchiveStaffSuggestionCommand {
  constructor(
    readonly id: string,
    readonly writtenBy: string | null,
  ) {}
}
