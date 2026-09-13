/** Command : retirer un article des CGV. */
export class RemoveSalesTermsParagraphCommand {
  constructor(
    readonly paragraphId: string,
    readonly staffUserId: string,
  ) {}
}
