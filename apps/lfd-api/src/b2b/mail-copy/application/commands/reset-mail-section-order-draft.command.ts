/** Command : rétablir l'ordre des sections du code au prochain « Publier » (E4). */
export class ResetMailSectionOrderDraftCommand {
  constructor(
    readonly mail: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
