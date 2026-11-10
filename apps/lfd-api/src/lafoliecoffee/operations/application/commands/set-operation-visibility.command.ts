/** **Masquer ou afficher** une opération — réversible, et distinct de l'archivage. */
export class SetOperationVisibilityCommand {
  constructor(
    readonly key: string,
    readonly hidden: boolean,
    readonly writtenBy: string | null,
  ) {}
}
