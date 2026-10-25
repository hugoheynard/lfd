/** Les étiquettes des bacs d'une commande, en PDF A6 (2026-10-25). */
export class GetOrderBinLabelsPdfQuery {
  constructor(
    readonly orderId: string,
    /** Les bacs à imprimer (`?bacs=`) ; vide : tous les bacs vivants. */
    readonly binIds: readonly string[],
  ) {}
}
