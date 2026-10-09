/**
 * **Renvoyer l'e-mail « Votre facture »** d'une pièce émise (plan
 * `facture-emise.md`) — un geste du staff
 * comptable, après un échec au journal ou une adresse corrigée.
 */
export class ResendInvoiceNoticeCommand {
  constructor(readonly invoiceId: string) {}
}
