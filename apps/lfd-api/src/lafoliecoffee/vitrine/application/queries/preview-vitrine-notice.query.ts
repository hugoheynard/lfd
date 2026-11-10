/** L'aperçu d'une annonce : l'e-mail tel qu'il partira, et à qui. N'écrit rien. */
export class PreviewVitrineNoticeQuery {
  constructor(
    readonly subject: string,
    readonly message: string,
    /** `null` : tous les abonnés qui ont un contact. */
    readonly subscriberIds: readonly string[] | null,
  ) {}
}
