/** Les étiquettes des sacs d'une commande, à imprimer (2026-10-25). */
export class GetBagLabelsQuery {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
  ) {}
}
