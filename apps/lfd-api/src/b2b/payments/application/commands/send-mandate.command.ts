/**
 * Envoyer au client **son mandat à signer**, en pièce jointe.
 *
 * Vise le mandat par son identifiant, comme la signature : c'est le document
 * qu'on envoie, pas « celui de cette société ».
 */
export class SendMandateCommand {
  constructor(
    readonly companyId: string,
    readonly mandateId: string,
  ) {}
}
