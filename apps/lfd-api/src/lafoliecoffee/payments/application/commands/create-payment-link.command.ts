/**
 * Créer un **lien de paiement libre** pour une société. `staffUserId` vient de
 * la fiche résolue par la porte staff, jamais de la charge utile.
 */
export class CreatePaymentLinkCommand {
  constructor(
    readonly companyId: string,
    readonly amountCents: number,
    readonly label: string,
    readonly staffUserId: string,
  ) {}
}
