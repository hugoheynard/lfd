/**
 * Règle les destinataires d'un avis : l'ensemble voulu de rôles et de membres
 * (lot P1c). `actorId` — l'id de FICHE de l'auteur, posé sur les lignes
 * ajoutées.
 */
export class SetStaffNoticeAudienceCommand {
  constructor(
    readonly template: string,
    readonly roleKeys: readonly string[],
    readonly staffUserIds: readonly string[],
    readonly actorId: string,
  ) {}
}
