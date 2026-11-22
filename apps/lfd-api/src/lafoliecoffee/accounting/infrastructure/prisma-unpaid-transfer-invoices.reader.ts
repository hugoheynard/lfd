import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
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
import { SETTLING_TRANSFER_OF_INVOICE_I } from "./transfer-trace.sql.js";

const DAY_LENGTH = 10;

/** Une ligne du journal Chorus, telle que `json_build_object` la rend (date en `AAAA-MM-JJ`). */
interface ChorusDepositJson {
  readonly kind: string;
  readonly occurredOn: string;
  readonly reason: string | null;
}

interface UnpaidRow {
  readonly id: string;
  readonly number: string;
  readonly legal_entity_id: string;
  readonly legal_entity_name: string;
  readonly payer_company_id: string;
  readonly buyer: unknown;
  readonly issued_on: Date;
  readonly due_on: Date | null;
  readonly total_ttc_cents: number;
  readonly prepaid_cents: number | null;
  readonly chorus_deposits: readonly ChorusDepositJson[];
}

/**
 * Les factures au virement (code 58 figé dans `payment_means`) qu'aucun
 * virement reçu ne règle, en UNE requête. « Réglée » se lit sur la trace de
 * la facturation — ses bons qui citent un virement — et jamais dans les
 * tables du bloc `payment`. Un avoir n'a pas de moyen : il n'y entre pas.
 */
@Injectable()
export class PrismaUnpaidTransferInvoicesReader extends UnpaidTransferInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unpaid(filter: UnpaidTransferFilter): Promise<readonly UnpaidTransferInvoice[]> {
    const rows = await this.prisma.$queryRaw<readonly UnpaidRow[]>`
      SELECT i."id", i."number", i."legal_entity_id", le."name" AS legal_entity_name,
             i."payer_company_id", i."buyer", i."issued_on", i."due_on",
             i."total_ttc_cents", i."prepaid_cents",
             COALESCE((SELECT json_agg(json_build_object(
                                'kind', d."kind",
                                'occurredOn', d."occurred_on",
                                'reason', d."reason"))
                         FROM "public"."invoice_chorus_deposit" d
                        WHERE d."invoice_id" = i."id"), '[]'::json) AS chorus_deposits
        FROM "public"."invoice" i
        JOIN "public"."legal_entities" le ON le."id" = i."legal_entity_id"
       WHERE i."type" = ${COMMERCIAL_INVOICE}
         AND i."payment_means"->>'code' = ${SEPA_CREDIT_TRANSFER}
         AND ${SETTLING_TRANSFER_OF_INVOICE_I} IS NULL
         ${filterOn("legal_entity_id", filter.legalEntityId)}
         ${filterOn("payer_company_id", filter.payerCompanyId)}
       ORDER BY i."number" ASC`;
    return rows.map(toUnpaid);
  }
}

/** `AND i."<colonne>" = <valeur>`, ou rien sans filtre. */
function filterOn(column: "legal_entity_id" | "payer_company_id", value: string | null) {
  return value === null ? Prisma.empty : Prisma.sql`AND i.${Prisma.raw(`"${column}"`)} = ${value}`;
}

function toUnpaid(row: UnpaidRow): UnpaidTransferInvoice {
  if (row.due_on === null) {
    throw new UnreadableInvoiceError(row.id, "due_on");
  }
  const buyer = invoicePayerOf(row.id, row.buyer);
  return {
    invoiceId: row.id,
    number: row.number,
    legalEntityId: row.legal_entity_id,
    legalEntityName: row.legal_entity_name,
    payerCompanyId: row.payer_company_id,
    payerName: buyer.name,
    issuedOn: row.issued_on.toISOString().slice(0, DAY_LENGTH),
    dueOn: row.due_on.toISOString().slice(0, DAY_LENGTH),
    remainingCents: row.total_ttc_cents - (row.prepaid_cents ?? 0),
    buyerLegalForm: buyer.legalForm,
    chorus: chorusStandingOfRows(
      row.id,
      row.chorus_deposits.map((deposit) => ({
        kind: deposit.kind,
        occurredOn: new Date(`${deposit.occurredOn}T00:00:00.000Z`),
        reason: deposit.reason,
      })),
    ),
  };
}
