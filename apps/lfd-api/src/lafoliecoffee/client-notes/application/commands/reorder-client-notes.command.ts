/** Range les notes du carnet d'un client dans un nouvel ordre — toutes, chacune une fois. */
export class ReorderClientNotesCommand {
  constructor(
    readonly companyId: string,
    readonly noteIds: readonly string[],
  ) {}
}
