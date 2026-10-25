/**
 * **Une impression du BL par l'équipe** (plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`), § 14) — le PDF de
 * transport ou le chiffré, servi à l'instant. `staffUserId` vient de la porte.
 */
export class RecordDeliveryNotePrintCommand {
  constructor(
    readonly orderId: string,
    readonly noteNumber: string,
    readonly staffUserId: string,
  ) {}
}
