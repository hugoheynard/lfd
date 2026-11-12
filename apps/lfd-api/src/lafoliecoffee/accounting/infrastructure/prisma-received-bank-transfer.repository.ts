import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ReceivedBankTransfer } from "../domain/entities/received-bank-transfer.js";
import { ReceivedBankTransferRepository } from "../domain/ports/received-bank-transfer.repository.js";

/**
 * Écrit le virement reçu et ses factures en un `create` imbriqué. L'unicité
 * de `invoice_id` est le filet d'une facture réglée deux fois ; le chemin,
 * c'est l'agrégat sous le verrou des bons.
 */
@Injectable()
export class PrismaReceivedBankTransferRepository extends ReceivedBankTransferRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(transfer: ReceivedBankTransfer): Promise<void> {
    const state = transfer.toState();
    await this.prisma.receivedBankTransfer.create({
      data: {
        id: state.id,
        legalEntityId: state.legalEntityId,
        payerCompanyId: state.payerCompanyId,
        amountCents: state.amountCents,
        receivedOn: new Date(`${state.receivedOn}T00:00:00.000Z`),
        reference: state.reference,
        recordedAt: state.recordedAt,
        recordedByStaffId: state.recordedByStaffId,
        invoices: {
          create: state.invoices.map((invoice) => ({
            invoiceId: invoice.invoiceId,
            amountCents: invoice.amountCents,
          })),
        },
      },
    });
  }
}
