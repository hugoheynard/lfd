/** Command : poser en brouillon l'ordre des sections d'un e-mail, sur la révision lue (E4). */
export class SaveMailSectionOrderDraftCommand {
  constructor(
    readonly mail: string,
    readonly order: readonly string[],
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
