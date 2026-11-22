import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CREDIT_NOTE } from "../domain/entities/invoice.types.js";
import type { TransferInvoice } from "../domain/entities/received-bank-transfer.js";
import { TransferInvoicesReader } from "../domain/ports/transfer-invoices.reader.js";
import { invoicePaymentMeansSchema } from "./invoice-json.schema.js";
import { invoicePayerName } from "./invoice-payer-name.js";
import { SETTLING_TRANSFER_OF_INVOICE_I } from "./transfer-trace.sql.js";

interface TransferInvoiceRow {
  readonly id: string;
  readonly number: string;
  readonly type: string;
  readonly legal_entity_id: string;
  readonly payer_company_id: string;
  readonly buyer: unknown;
  readonly payment_means: unknown;
  readonly total_ttc_cents: number;
  readonly prepaid_cents: number | null;
  readonly order_ids: readonly string[];
  readonly settled_by_transfer_id: string | null;
}

/**
 * Les factures qu'un virement va régler, en UNE requête : la pièce, ses bons
 * dans l'ordre, et le virement que ses bons citent déjà (la trace de la
 * facturation). Tables de la comptabilité seulement.
 */
@Injectable()
export class PrismaTransferInvoicesReader extends TransferInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofIds(invoiceIds: readonly string[]): Promise<readonly TransferInvoice[]> {
    if (invoiceIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<readonly TransferInvoiceRow[]>`
      SELECT i."id", i."number", i."type", i."legal_entity_id", i."payer_company_id",
             i."buyer", i."payment_means", i."total_ttc_cents", i."prepaid_cents",
             ARRAY(SELECT io."order_id"
                     FROM "public"."invoice_order" io
                    WHERE io."invoice_id" = i."id"
                    ORDER BY io."position") AS order_ids,
             ${SETTLING_TRANSFER_OF_INVOICE_I} AS settled_by_transfer_id
        FROM "public"."invoice" i
       WHERE i."id" = ANY(${[...invoiceIds]}::text[])`;
    return rows.map((row) => ({
      invoiceId: row.id,
      number: row.number,
      legalEntityId: row.legal_entity_id,
      payerCompanyId: row.payer_company_id,
      payerName: invoicePayerName(row.id, row.buyer),
      paymentMeansCode: invoicePaymentMeansSchema.safeParse(row.payment_means).data?.code ?? null,
      isCreditNote: row.type === CREDIT_NOTE,
      remainingCents: row.total_ttc_cents - (row.prepaid_cents ?? 0),
      settledByTransferId: row.settled_by_transfer_id,
      orderIds: row.order_ids,
    }));
  }
}
