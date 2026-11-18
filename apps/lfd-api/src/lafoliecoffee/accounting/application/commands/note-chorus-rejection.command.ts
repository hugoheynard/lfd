/**
 * **« Rejetée par Chorus »** (T5′) : le portail a rejeté la facture déposée,
 * pour ce motif. Elle sort des paiements attendus ; la comptabilité fait
 * l'avoir et une nouvelle facture, à la main.
 */
export class NoteChorusRejectionCommand {
  constructor(
    readonly invoiceId: string,
    readonly occurredOn: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
