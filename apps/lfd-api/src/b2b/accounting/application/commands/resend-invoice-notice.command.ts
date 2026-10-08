/**
 * **Renvoyer l'e-mail « Votre facture »** d'une pièce émise (plan
 * `plan-emission-de-la-facture.md`, E6, suite (b)) — un geste du staff
 * comptable, après un échec au journal ou une adresse corrigée.
 */
export class ResendInvoiceNoticeCommand {
  constructor(readonly invoiceId: string) {}
}
