/** Command : déplacer un article au rang demandé, à partir de zéro. */
export class MoveSalesTermsParagraphCommand {
  constructor(
    readonly paragraphId: string,
    readonly position: number,
    readonly staffUserId: string,
  ) {}
}
