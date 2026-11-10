import { Injectable } from "@nestjs/common";

import { CardSettlementReader } from "../../../card-payment/channels/requests/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { orderCardSubject } from "../../orders/application/services/order-card-subject.js";
import {
  RefundCreditLinks,
  RefundsToCreditReader,
  type CreditableRefund,
} from "../domain/ports/refunds-to-credit.js";

/**
 * Les remboursements réussis d'une commande (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §5.1, §6.1, lot P1.c) : le carnet du bloc `card-payment`
 * (`succeededRefundsOf`, trié par `recordedAt, id` — l'ordre que le
 * rapprochement suppose pour ventiler le dernier avoir au reste exact), et
 * leur rapprochement dans `public.refund_credit`, la table de la
 * comptabilité. Lecture seule ; deux lectures, sans jointure : `refund_id`
 * est un identifiant opaque, sans clé étrangère vers `card_payment`.
 */
@Injectable()
export class PrismaRefundsToCreditReader extends RefundsToCreditReader {
  constructor(
    private readonly cards: CardSettlementReader,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async succeededOf(orderId: string): Promise<readonly CreditableRefund[]> {
    const refunds = await this.cards.succeededRefundsOf(orderCardSubject(orderId));
    if (refunds.length === 0) {
      return [];
    }
    const credits = await this.prisma.refundCredit.findMany({
      where: { refundId: { in: refunds.map((refund) => refund.refundId) } },
      select: { refundId: true, creditNoteId: true },
    });
    const byRefund = new Map(credits.map((credit) => [credit.refundId, credit.creditNoteId]));
    return refunds.map((refund) => ({
      refundId: refund.refundId,
      amountCents: refund.amountCents,
      nature: refund.nature,
      creditNoteId: byRefund.get(refund.refundId) ?? null,
      reconciled: byRefund.has(refund.refundId),
    }));
  }
}

/**
 * Le rapprochement d'un remboursement : la SEULE écriture de la comptabilité
 * sur le remboursement par carte, dans SA table (`public.refund_credit`) —
 * plus jamais dans le carnet. Une ligne par remboursement (`refund_id`, clé
 * primaire) ; une ligne déjà là est une course que le verrou de la commande
 * aurait dû empêcher, donc une panne — la transaction de l'avoir est annulée.
 */
@Injectable()
export class PrismaRefundCreditLinks extends RefundCreditLinks {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  link(refundId: string, creditNoteId: string, at: Date): Promise<void> {
    return this.write(refundId, { creditNoteId, reason: "credit_note" }, at);
  }

  noteAdjustment(refundId: string, at: Date): Promise<void> {
    return this.write(refundId, { creditNoteId: null, reason: "adjustment" }, at);
  }

  private async write(
    refundId: string,
    credit: {
      readonly creditNoteId: string | null;
      readonly reason: "credit_note" | "adjustment";
    },
    at: Date,
  ): Promise<void> {
    const { count } = await this.prisma.refundCredit.createMany({
      data: [{ refundId, ...credit, createdAt: at }],
      skipDuplicates: true,
    });
    if (count !== 1) {
      throw new RefundAlreadyCreditedError(refundId);
    }
  }
}

export class RefundAlreadyCreditedError extends TechnicalError {
  constructor(readonly refundId: string) {
    super(
      "accounting.refund.already_credited",
      `Le remboursement ${refundId} est déjà rapproché (un avoir, ou un ajustement sans avoir) : ` +
        "l'avoir en cours est annulé avec sa transaction. Le signaler à l'équipe technique.",
    );
  }
}
