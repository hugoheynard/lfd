/** Le compte à produire d'une journée, en PDF. */
export class GetProductionCountPdfQuery {
  constructor(readonly serviceDay: string) {}
}

/**
 * La feuille d'atelier d'une commande, en PDF.
 *
 * Le jour est demandé **avec** la référence : une feuille appartient à une
 * journée, et c'est la journée qui porte l'instant de clôture dont le document
 * est daté. La chercher sans son jour obligerait à balayer les journées.
 */
export class GetAtelierSheetPdfQuery {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
  ) {}
}
