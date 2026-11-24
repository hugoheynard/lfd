/**
 * **Rétablit une échéance** d'un panier : elle revient au gabarit (une
 * échéance sautée est de nouveau à passer, une échéance modifiée reprend les
 * lignes du panier). Mur : l'acheteur du panier. `date` est le jour de
 * service visé, `AAAA-MM-JJ`.
 */
export class RestoreOccurrenceCommand {
  constructor(
    readonly actorUserId: string,
    readonly basketId: string,
    readonly date: string,
  ) {}
}
