import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE, SEPA_CREDIT_TRANSFER } from "../domain/entities/invoice.types.js";
import { UnreadableInvoiceError } from "../domain/errors/invoice-errors.js";
import {
  UnpaidTransferInvoicesReader,
  type UnpaidTransferFilter,
  type UnpaidTransferInvoice,
} from "../domain/ports/unpaid-transfer-invoices.reader.js";
import { chorusStandingOfRows } from "./chorus-deposit-rows.js";
import { invoicePayerOf } from "./invoice-payer-name.js";

const DAY_LENGTH = 10;

/**
 * Les factures au virement (code 58 figé dans `payment_means`) qu'aucun
 * virement reçu ne règle, en UNE requête. Un avoir n'a pas de moyen : il
 * n'y entre pas.
 */
@Injectable()
export class PrismaUnpaidTransferInvoicesReader extends UnpaidTransferInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unpaid(filter: UnpaidTransferFilter): Promise<readonly UnpaidTransferInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        type: COMMERCIAL_INVOICE,
        paymentMeans: { path: ["code"], equals: SEPA_CREDIT_TRANSFER },
        bankTransfer: null,
        ...(filter.legalEntityId === null ? {} : { legalEntityId: filter.legalEntityId }),
        ...(filter.payerCompanyId === null ? {} : { payerCompanyId: filter.payerCompanyId }),
      },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        legalEntityId: true,
        legalEntity: { select: { name: true } },
        payerCompanyId: true,
        buyer: true,
        issuedOn: true,
        dueOn: true,
        totalTtcCents: true,
        prepaidCents: true,
        chorusDeposits: { select: { kind: true, occurredOn: true, reason: true } },
      },
    });
    return rows.map((row) => {
      if (row.dueOn === null) {
        throw new UnreadableInvoiceError(row.id, "due_on");
      }
      const buyer = invoicePayerOf(row.id, row.buyer);
      return {
        invoiceId: row.id,
        number: row.number,
        legalEntityId: row.legalEntityId,
        legalEntityName: row.legalEntity.name,
        payerCompanyId: row.payerCompanyId,
        payerName: buyer.name,
        issuedOn: row.issuedOn.toISOString().slice(0, DAY_LENGTH),
        dueOn: row.dueOn.toISOString().slice(0, DAY_LENGTH),
        remainingCents: row.totalTtcCents - (row.prepaidCents ?? 0),
        buyerLegalForm: buyer.legalForm,
        chorus: chorusStandingOfRows(row.id, row.chorusDeposits),
      };
    });
  }
}
