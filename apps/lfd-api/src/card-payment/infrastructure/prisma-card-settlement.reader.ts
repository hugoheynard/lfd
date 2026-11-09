import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type CardPaymentLine,
  CardSettlementReader,
  type CardSettlementPosition,
} from "../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../channels/subjects/index.js";
import type { CardPayment } from "../domain/entities/card-payment.js";
import { toDomain } from "./card-payment-rows.js";

const keyOf = (type: string, id: string): string => `${type}\u0000${id}`;

/**
 * **Les positions carte, par lot** (plan M2, §3.3) — une lecture, une requête
 * pour tous les sujets d'un même type. N'écrit jamais (§4.6).
 */
@Injectable()
export class PrismaCardSettlementReader extends CardSettlementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    if (subjects.length === 0) {
      return [];
    }
    const rows = await this.prisma.cardPayment.findMany({
      where: { OR: byType(subjects) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const lines = new Map<string, CardPaymentLine[]>();
    for (const payment of rows.map(toDomain)) {
      const key = keyOf(payment.subject.type, payment.subject.id);
      lines.set(key, [...(lines.get(key) ?? []), lineOf(payment)]);
    }
    return subjects.map((subject) => {
      const payments = lines.get(keyOf(subject.type, subject.id)) ?? [];
      return { subject, payments, chargedCents: chargedOf(payments) };
    });
  }
}

/** Une clause par type de sujet : `(subject_type, subject_id IN …)`. */
function byType(
  subjects: readonly CardSubject[],
): { subjectType: string; subjectId: { in: string[] } }[] {
  const ids = new Map<string, string[]>();
  for (const subject of subjects) {
    ids.set(subject.type, [...(ids.get(subject.type) ?? []), subject.id]);
  }
  return [...ids].map(([subjectType, list]) => ({ subjectType, subjectId: { in: list } }));
}

function lineOf(payment: CardPayment): CardPaymentLine {
  return {
    paymentId: payment.id,
    account: payment.account.name,
    providerRef: payment.providerRef,
    role: payment.role,
    state: payment.state,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
  };
}

/** **Encaissé** : `Σ montant` des paiements `paid`. */
export function chargedOf(payments: readonly CardPaymentLine[]): number {
  return payments
    .filter((payment) => payment.state === "paid")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}
