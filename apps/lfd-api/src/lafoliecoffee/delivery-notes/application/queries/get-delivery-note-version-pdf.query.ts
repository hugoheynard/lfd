/**
 * Le PDF d'une **version figée** d'un BL chiffré (plan du reliquat, § 5 ter) —
 * rendu de la version seule, pour l'équipe. Ce n'est pas une impression.
 */
export class GetDeliveryNoteVersionPdfQuery {
  constructor(
    readonly orderId: string,
    readonly noteNumber: string,
    readonly version: number,
  ) {}
}
