import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import {
  BankTransferTraceReader,
  type InvoiceTrace,
  type SettledOrderTrace,
} from "../domain/ports/bank-transfer-trace.reader.js";

interface SettledOrderRow {
  readonly order_id: string;
  readonly bank_transfer_id: string;
  readonly invoice_id: string | null;
  readonly number: string | null;
}

interface InvoiceOrderRow {
  readonly invoice_id: string;
  readonly number: string;
  readonly order_id: string | null;
  readonly bank_transfer_id: string | null;
}

/**
 * La trace du virement sur les bons, en une requête par question. Tables de
 * la comptabilité seulement : `order_collection.order_id` est opaque, la
 * jointure vers la facture passe par `invoice_order` (une facture 380 par bon).
 */
@Injectable()
export class PrismaBankTransferTraceReader extends BankTransferTraceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async settledOrdersSince(since: Date): Promise<readonly SettledOrderTrace[]> {
    const rows = await this.prisma.$queryRaw<readonly SettledOrderRow[]>`
      SELECT oc."order_id", oc."bank_transfer_id", io."invoice_id", i."number"
        FROM "public"."order_collection" oc
        LEFT JOIN "public"."invoice_order" io
          ON io."order_id" = oc."order_id" AND io."invoice_type" = ${COMMERCIAL_INVOICE}
        LEFT JOIN "public"."invoice" i ON i."id" = io."invoice_id"
       WHERE oc."state" = 'settled_by_transfer'
         AND oc."bank_transfer_id" IS NOT NULL
         AND oc."updated_at" >= ${since}
       ORDER BY oc."order_id"`;
    return rows.map((row) => ({
      orderId: row.order_id,
      bankTransferId: row.bank_transfer_id,
      invoiceId: row.invoice_id,
      invoiceNumber: row.number,
    }));
  }

  async invoicesOf(invoiceIds: readonly string[]): Promise<readonly InvoiceTrace[]> {
    if (invoiceIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<readonly InvoiceOrderRow[]>`
      SELECT i."id" AS invoice_id, i."number", io."order_id", oc."bank_transfer_id"
        FROM "public"."invoice" i
        LEFT JOIN "public"."invoice_order" io ON io."invoice_id" = i."id"
        LEFT JOIN "public"."order_collection" oc ON oc."order_id" = io."order_id"
       WHERE i."id" = ANY(${[...invoiceIds]}::text[])
         AND i."type" = ${COMMERCIAL_INVOICE}
       ORDER BY i."id", io."position"`;
    const traces = new Map<string, { number: string; orders: InvoiceTrace["orders"][number][] }>();
    for (const row of rows) {
      const trace = traces.get(row.invoice_id) ?? { number: row.number, orders: [] };
      traces.set(row.invoice_id, trace);
      if (row.order_id !== null) {
        trace.orders.push({ orderId: row.order_id, settledByTransferId: row.bank_transfer_id });
      }
    }
    return [...traces].map(([invoiceId, trace]) => ({ invoiceId, ...trace }));
  }
}
