/** **Archiver** une promotion — terminal, motif obligatoire. */
export class ArchivePromotionCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string,
  ) {}
}
