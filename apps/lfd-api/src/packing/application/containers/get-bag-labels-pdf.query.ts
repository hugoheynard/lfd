/** Les étiquettes des sacs d'une commande, en PDF A6 (2026-10-25). */
export class GetBagLabelsPdfQuery {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
    /** Les sacs à imprimer (`?sacs=`) ; vide : tous les sacs vivants. */
    readonly containerIds: readonly string[],
  ) {}
}
