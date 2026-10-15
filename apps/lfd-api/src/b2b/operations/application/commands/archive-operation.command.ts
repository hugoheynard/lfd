/** **Archiver** une opération : retirée pour toujours, sa clé reste prise. */
export class ArchiveOperationCommand {
  constructor(
    readonly key: string,
    readonly writtenBy: string | null,
  ) {}
}
