import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  RefundCreditLinks,
  RefundsToCreditReader,
  type CreditableRefund,
} from "../domain/ports/refunds-to-credit.js";

/**
 * Les remboursements réussis d'une commande, lus dans `order_refund` (écrite
 * par le carnet des commandes, lot R1). Lecture seule.
 */
@Injectable()
export class PrismaRefundsToCreditReader extends RefundsToCreditReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async succeededOf(orderId: string): Promise<readonly CreditableRefund[]> {
    const rows = await this.prisma.orderRefund.findMany({
      where: { orderId, status: "succeeded" },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      select: { id: true, amountCents: true, creditNoteId: true },
    });
    return rows.map((row) => ({
      refundId: row.id,
      amountCents: row.amountCents,
      creditNoteId: row.creditNoteId,
    }));
  }
}

/**
 * Le lien remboursement → avoir : la SEULE écriture de la comptabilité dans
 * `order_refund`, et sur la seule colonne que le carnet ne touche jamais.
 * Conditionnée sur `credit_note_id IS NULL` ; une ligne déjà liée est une
 * course que le verrou de la commande aurait dû empêcher, donc une panne.
 */
@Injectable()
export class PrismaRefundCreditLinks extends RefundCreditLinks {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async link(refundId: string, creditNoteId: string): Promise<void> {
    const { count } = await this.prisma.orderRefund.updateMany({
      where: { id: refundId, creditNoteId: null },
      data: { creditNoteId },
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
      `Le remboursement ${refundId} a déjà son avoir, ou n'existe plus : l'avoir en cours est ` +
        "annulé avec sa transaction. Le signaler à l'équipe technique.",
    );
  }
}
