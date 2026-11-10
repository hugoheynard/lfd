import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InvoiceSettlementFactsReader,
  type InvoiceCollectionFacts,
} from "../domain/ports/invoice-settlement-facts.reader.js";
import type {
  DebitBatchStatus,
  DebitReturnResolution,
  InvoiceDebitFact,
} from "../domain/services/invoice-settlement.js";

interface DebitRow {
  readonly invoice_id: string;
  readonly batch_id: string;
  readonly batch_status: DebitBatchStatus;
  readonly constituted_at: Date;
  readonly requested_collection_day: Date | null;
  readonly notice_collection_day: Date | null;
  readonly resolution: DebitReturnResolution | null;
  readonly returned_on: Date | null;
  readonly invoice_count: number;
}

/**
 * Les faits de prélèvement de « Mes factures », en DEUX requêtes pour toutes
 * les pièces : leurs lignes (lot, avis, retour, factures de la ligne), puis
 * celles dont un bon a quitté `due`. Tables du bloc `b2b`, toutes écrites par
 * la comptabilité ; `order_collection.order_id` est opaque, la jointure passe
 * par `invoice_order`.
 */
@Injectable()
export class PrismaInvoiceSettlementFactsReader extends InvoiceSettlementFactsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async factsOf(
    invoiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceCollectionFacts>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }
    const [debits, blocked] = await Promise.all([
      this.debitsOf(invoiceIds),
      this.blockedOf(invoiceIds),
    ]);
    const facts = new Map<string, { debits: InvoiceDebitFact[]; blocked: boolean }>();
    const entry = (id: string): { debits: InvoiceDebitFact[]; blocked: boolean } => {
      const existing = facts.get(id) ?? { debits: [], blocked: false };
      facts.set(id, existing);
      return existing;
    };
    for (const row of debits) {
      entry(row.invoice_id).debits.push(toDebit(row));
    }
    for (const id of blocked) {
      entry(id).blocked = true;
    }
    return facts;
  }

  private debitsOf(invoiceIds: readonly string[]): Promise<readonly DebitRow[]> {
    return this.prisma.$queryRaw<readonly DebitRow[]>`
      SELECT li."invoice_id",
             b."id" AS batch_id,
             b."status"::text AS batch_status,
             b."constituted_at",
             b."requested_collection_day",
             n."collection_day" AS notice_collection_day,
             r."resolution"::text AS resolution,
             r."returned_on",
             (SELECT COUNT(*)::int
                FROM "public"."collection_batch_line_invoice" co
               WHERE co."batch_id" = li."batch_id"
                 AND co."line_rank" = li."line_rank") AS invoice_count
        FROM "public"."collection_batch_line_invoice" li
        JOIN "public"."collection_batch" b ON b."id" = li."batch_id"
        JOIN "public"."collection_batch_line" l
          ON l."batch_id" = li."batch_id" AND l."rank" = li."line_rank"
        LEFT JOIN "public"."collection_notice" n
          ON n."batch_id" = li."batch_id" AND n."line_rank" = li."line_rank"
        LEFT JOIN "public"."collection_return" r ON r."end_to_end_id" = l."end_to_end_id"
       WHERE li."invoice_id" = ANY(${[...invoiceIds]}::text[])`;
  }

  /** Les pièces dont un bon n'est plus `due` (l'absence de ligne vaut `due`). */
  private async blockedOf(invoiceIds: readonly string[]): Promise<readonly string[]> {
    const rows = await this.prisma.$queryRaw<readonly { readonly invoice_id: string }[]>`
      SELECT DISTINCT io."invoice_id"
        FROM "public"."invoice_order" io
        JOIN "public"."order_collection" oc ON oc."order_id" = io."order_id"
       WHERE io."invoice_id" = ANY(${[...invoiceIds]}::text[])
         AND oc."state" <> 'due'`;
    return rows.map((row) => row.invoice_id);
  }
}

function toDebit(row: DebitRow): InvoiceDebitFact {
  return {
    batchId: row.batch_id,
    batchStatus: row.batch_status,
    constitutedAt: row.constituted_at,
    requestedCollectionDay: dayOf(row.requested_collection_day),
    noticeCollectionDay: dayOf(row.notice_collection_day),
    returnResolution: row.resolution,
    returnedOn: dayOf(row.returned_on),
    invoiceCountOnDebit: row.invoice_count,
  };
}

function dayOf(column: Date | null): string | null {
  return column === null ? null : column.toISOString().slice(0, 10);
}
