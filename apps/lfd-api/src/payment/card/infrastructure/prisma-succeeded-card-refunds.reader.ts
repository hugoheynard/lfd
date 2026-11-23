import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SucceededCardRefundsReader,
  type SubjectSucceededRefund,
} from "../../channels/requests/succeeded-card-refunds.reader.js";
import type {
  CardRefundNature,
  CardRefundStatus,
} from "../domain/value-objects/card-refund-values.js";

/** Le seul statut que la position d'un sujet compte au remboursé (`positionFrom`). */
const SUCCEEDED: CardRefundStatus = "succeeded";

/** Une ligne du carnet lue, avec le sujet de son paiement. */
export interface SucceededRefundRow {
  readonly refundedAt: Date;
  readonly amountCents: number;
  readonly nature: CardRefundNature | null;
  readonly payment: { readonly subjectId: string };
}

/** Ligne → remboursement réussi du sujet. */
export function subjectSucceededRefundOf(row: SucceededRefundRow): SubjectSucceededRefund {
  return {
    subjectId: row.payment.subjectId,
    refundedAt: row.refundedAt,
    amountCents: row.amountCents,
    nature: row.nature,
  };
}

/**
 * Une requête pour tout le lot, sur le carnet du bloc et ses paiements
 * (`payment.card_refund` → `payment.card_payment`) ; un lot vide ne touche
 * pas la base. Par le client ambiant, comme `PrismaCardSettlementReader`.
 */
@Injectable()
export class PrismaSucceededCardRefundsReader extends SucceededCardRefundsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async succeededOf(
    subjectType: string,
    subjectIds: readonly string[],
  ): Promise<readonly SubjectSucceededRefund[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.cardRefund.findMany({
      where: {
        status: SUCCEEDED,
        payment: { subjectType, subjectId: { in: [...new Set(subjectIds)] } },
      },
      select: {
        refundedAt: true,
        amountCents: true,
        nature: true,
        payment: { select: { subjectId: true } },
      },
      orderBy: [{ refundedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(subjectSucceededRefundOf);
  }
}
