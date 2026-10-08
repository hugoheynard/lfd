import type { CardInvoiceSignalView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CardInvoiceOutcomes,
  type CardInvoiceOutcomeKey,
} from "../domain/ports/card-invoice-outcomes.js";
import { CardInvoiceSignalsReader } from "../domain/ports/card-invoice-signals.reader.js";
import { BLOCKED_OUTCOME, ISSUED_OUTCOME } from "./prisma-monthly-invoice-outcomes.js";

/**
 * L'issue de la facture carte par commande, dans `public.card_invoice_outcome`.
 *
 * 🔴 Le déclencheur `card_invoice_outcome_final` refuse de toucher une issue
 * `issued` : un refus n'écrase donc qu'un refus (`outcome = blocked` dans le
 * `where`).
 */
@Injectable()
export class PrismaCardInvoiceOutcomes extends CardInvoiceOutcomes {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordIssued(key: CardInvoiceOutcomeKey, invoiceId: string): Promise<void> {
    const columns = { ...columnsOf(key), outcome: ISSUED_OUTCOME, invoiceId, message: null };
    await this.prisma.cardInvoiceOutcome.upsert({
      where: { orderId: key.orderId },
      create: columns,
      update: columns,
    });
  }

  async recordBlocked(key: CardInvoiceOutcomeKey, message: string): Promise<void> {
    const columns = { ...columnsOf(key), outcome: BLOCKED_OUTCOME, invoiceId: null, message };
    const { count } = await this.prisma.cardInvoiceOutcome.createMany({
      data: [columns],
      skipDuplicates: true,
    });
    if (count === 0) {
      await this.prisma.cardInvoiceOutcome.updateMany({
        where: { orderId: key.orderId, outcome: BLOCKED_OUTCOME },
        data: columns,
      });
    }
  }
}

function columnsOf(key: CardInvoiceOutcomeKey) {
  return {
    orderId: key.orderId,
    orderNumber: key.orderNumber,
    legalEntityId: key.legalEntityId,
    payerCompanyId: key.payerCompanyId,
    payerName: key.payerName,
    recordedAt: key.at,
  };
}

/** Les issues signalées, pour l'écran Comptabilité. */
@Injectable()
export class PrismaCardInvoiceSignalsReader extends CardInvoiceSignalsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async signaled(): Promise<readonly CardInvoiceSignalView[]> {
    const rows = await this.prisma.cardInvoiceOutcome.findMany({
      where: { outcome: BLOCKED_OUTCOME },
      orderBy: [{ recordedAt: "desc" }, { orderNumber: "asc" }],
    });
    return rows.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      payerCompanyId: row.payerCompanyId,
      payerName: row.payerName,
      message: row.message ?? "",
      recordedAt: row.recordedAt.toISOString(),
    }));
  }
}
