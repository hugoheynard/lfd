import type { BankTransferEntry } from "../../domain/entities/received-bank-transfer.js";

/**
 * **« Virement reçu »** (`le-paiement-par-virement.md`, V7) :
 * un virement lu sur le relevé règle des factures au virement de l'entité.
 * `intentKey` : la clé d'intention de l'écran — un second envoi rend le même
 * virement sans rien réécrire.
 */
export class RecordBankTransferCommand {
  constructor(
    readonly legalEntityId: string,
    readonly entry: BankTransferEntry,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
