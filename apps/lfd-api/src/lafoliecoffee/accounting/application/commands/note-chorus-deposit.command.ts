/**
 * **« Déposée le … »** (plan `plan-clients-publics-chorus.md`, T5′) : la
 * comptabilité a déposé la facture d'un organisme public sur Chorus Pro ce
 * jour-là ; le délai de paiement en part.
 */
export class NoteChorusDepositCommand {
  constructor(
    readonly invoiceId: string,
    readonly occurredOn: string,
    readonly staffUserId: string,
  ) {}
}
