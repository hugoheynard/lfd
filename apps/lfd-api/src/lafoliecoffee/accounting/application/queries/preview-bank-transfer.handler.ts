import type { BankTransferPreviewView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { previewBankTransfer } from "../../domain/entities/received-bank-transfer.js";
import { TransferInvoicesReader } from "../../domain/ports/transfer-invoices.reader.js";
import { PreviewBankTransferQuery } from "./preview-bank-transfer.query.js";

/**
 * **L'écart avant de valider un virement** : le reste dû des factures cochées,
 * le montant reçu et leur écart, par la fonction même que la saisie applique
 * (`previewBankTransfer` partage `judgeInvoices` avec
 * `ReceivedBankTransfer.record`). Une seule arithmétique : l'écran n'additionne
 * aucun montant. N'écrit rien.
 *
 * @throws les refus de facture de `ReceivedBankTransfer.record`.
 */
@QueryHandler(PreviewBankTransferQuery)
export class PreviewBankTransferHandler implements IQueryHandler<
  PreviewBankTransferQuery,
  BankTransferPreviewView
> {
  constructor(private readonly invoices: TransferInvoicesReader) {}

  async execute(query: PreviewBankTransferQuery): Promise<BankTransferPreviewView> {
    return previewBankTransfer(
      query.amountCents,
      query.invoiceIds,
      await this.invoices.ofIds(query.invoiceIds),
      query.legalEntityId,
    );
  }
}
