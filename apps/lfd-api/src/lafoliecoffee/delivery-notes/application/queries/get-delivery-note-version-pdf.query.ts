/**
 * Le PDF d'une **version figée** d'un BL chiffré (`documentation/commandes/reliquat/reliquat.md`, § 7) —
 * rendu de la version seule, pour l'équipe. Ce n'est pas une impression.
 */
export class GetDeliveryNoteVersionPdfQuery {
  constructor(
    readonly orderId: string,
    readonly noteNumber: string,
    readonly version: number,
  ) {}
}
