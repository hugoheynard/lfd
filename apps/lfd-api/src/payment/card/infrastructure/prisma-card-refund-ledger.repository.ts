import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { lockRow } from "../../shared/infrastructure/row-lock.js";
import { CardRefundLedger } from "../domain/entities/card-refund-ledger.js";
import { CardRefundLedgerRepository } from "../domain/ports/card-refund-ledger.repository.js";
import { PaymentSubject } from "../domain/value-objects/payment-subject.js";
import { lineOf } from "./card-refund-rows.js";

/**
 * **Le carnet**, dans `payment.card_refund` — l'écrivain UNIQUE de la table.
 * Le verrou est celui de la ligne `card_payment` : deux constats du même paiement
 * se sérialisent, et le cumul se lit à jour.
 */
@Injectable()
export class PrismaCardRefundLedgerRepository extends CardRefundLedgerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async subjectOf(paymentId: string): Promise<PaymentSubject | null> {
    const row = await this.prisma.cardPayment.findUnique({
      where: { id: paymentId },
      select: { subjectType: true, subjectId: true },
    });
    return row === null ? null : PaymentSubject.of(row.subjectType, row.subjectId);
  }

  async loadByPayment(paymentId: string): Promise<CardRefundLedger | null> {
    if (currentTransaction() !== undefined) {
      await lockRow(this.prisma, "card_payment", paymentId);
    }
    const payment = await this.prisma.cardPayment.findUnique({ where: { id: paymentId } });
    if (payment === null) {
      return null;
    }
    const rows = await this.prisma.cardRefund.findMany({
      where: { paymentId },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    });
    return CardRefundLedger.rehydrate({
      paymentId,
      subject: PaymentSubject.of(payment.subjectType, payment.subjectId),
      account: payment.account,
      paymentRef: payment.providerRef,
      amountCents: payment.amountCents,
      paid: payment.state === "paid",
      lines: rows.map(lineOf),
    });
  }

  async save(ledger: CardRefundLedger): Promise<void> {
    const { created, updated } = ledger.toPersistence();
    if (created.length > 0) {
      await this.prisma.cardRefund.createMany({
        data: created.map((line) => ({
          ...line,
          paymentId: ledger.paymentId,
          account: ledger.account,
        })),
      });
    }
    for (const line of updated) {
      // Seul ce qu'un constat change : le reste est immuable (déclencheur `refund_guard`).
      await this.prisma.cardRefund.update({
        where: { id: line.id },
        data: { status: line.status, updatedAt: line.updatedAt },
      });
    }
  }
}
