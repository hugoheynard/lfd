/** **« Mise en paiement »** (T5′) : facultatif, informatif — le virement reçu reste ce qui règle. */
export class NoteChorusAcceptanceCommand {
  constructor(
    readonly invoiceId: string,
    readonly occurredOn: string,
    readonly staffUserId: string,
  ) {}
}
