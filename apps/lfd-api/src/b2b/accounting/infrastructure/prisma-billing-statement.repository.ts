import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { BillingStatement } from "../domain/entities/billing-statement.js";
import {
  BillingStatementRepository,
  type CancelledStatement,
} from "../domain/ports/billing-statement.repository.js";
import { bodyJson, buyerJson, sellerJson } from "./billing-statement-json.js";

/**
 * Adaptateur d'écriture des arrêtés. Il n'a que les deux gestes du port : un
 * `create` à la constitution, un passage `cancelled` à l'annulation du lot.
 *
 * 🔴 La base garde l'immuabilité quoi qu'écrive ce fichier : le déclencheur
 * `billing_statement_immutable` (migration `20261008140000_l_arrete_de_facturation`)
 * refuse tout `DELETE`, toute modification autre que `active → cancelled`, et
 * l'annulation d'un arrêté dont le lot n'est plus `constituted`.
 */
@Injectable()
export class PrismaBillingStatementRepository extends BillingStatementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async insert(statement: BillingStatement): Promise<void> {
    const state = statement.toPersistence();
    await this.prisma.billingStatement.create({
      data: {
        id: state.id,
        batchId: state.batchId,
        lineRank: state.lineRank,
        status: "active",
        payerCompanyId: state.payerCompanyId,
        legalEntityId: state.legalEntityId,
        seller: sellerJson(state.seller),
        buyer: buyerJson(state.buyer),
        issuedOn: dayColumn(state.issuedOn),
        periodStartsOn: state.periodStartsOn === null ? null : dayColumn(state.periodStartsOn),
        periodEndsOn: state.periodEndsOn === null ? null : dayColumn(state.periodEndsOn),
        totalHtCents: state.totalHtCents,
        totalVatCents: state.totalVatCents,
        totalTtcCents: state.totalTtcCents,
        ordersTotalCents: state.ordersTotalCents,
        body: bodyJson(state.body),
        bodyVersion: state.bodyVersion,
        computedWith: state.computedWith,
        orders: { create: state.orderIds.map((orderId) => ({ orderId })) },
      },
    });
  }

  async cancelForBatch(batchId: string): Promise<readonly CancelledStatement[]> {
    const active = await this.prisma.billingStatement.findMany({
      where: { batchId, status: "active" },
      orderBy: { lineRank: "asc" },
      select: { id: true, lineRank: true },
    });
    if (active.length === 0) {
      return [];
    }
    await this.prisma.billingStatement.updateMany({
      where: { batchId, status: "active" },
      data: { status: "cancelled" },
    });
    return active.map((row) => ({ statementId: row.id, lineRank: row.lineRank }));
  }
}

/**
 * Un jour `AAAA-MM-JJ` vers une colonne `DATE` : Prisma la porte en `Date` à
 * minuit UTC, et la relit de même — c'est une clé de calendrier, jamais
 * comparée à l'horloge.
 */
function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
