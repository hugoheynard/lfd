import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompletedOrderUnsettledError } from "../domain/errors/completed-order-errors.js";
import {
  CompletedOrderReader,
  type CompletedOrder,
  type CompletedOrderPage,
} from "../domain/ports/completed-order.reader.js";

/** La règle « définitive », écrite une fois pour les trois lectures. */
const COMPLETED_WHERE = {
  status: OrderStatus.fulfilled,
  paymentStatus: PaymentStatus.paid,
  clientele: { not: null },
} as const;

const SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  clientele: true,
  companyId: true,
  placedByUserId: true,
  billableSubtotalCents: true,
  billableDiscountCents: true,
  billableVoucherDiscountCents: true,
  placedBy: { select: { auth0Sub: true } },
} as const;

/** Une ligne lue — exportée pour le test du mapper. */
export interface CompletedRow {
  readonly id: string;
  readonly orderNumber: string;
  /** « passée le » — la colonne n'a pas d'autre nom (`orders.prisma`). */
  readonly createdAt: Date;
  readonly clientele: "pro" | "public" | null;
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly billableSubtotalCents: number | null;
  readonly billableDiscountCents: number | null;
  readonly billableVoucherDiscountCents: number | null;
  readonly placedBy: { readonly auth0Sub: string | null };
}

/**
 * Les commandes définitives en Postgres. Lit `users.auth0_sub` pour une seule
 * chose : dire si l'acheteur est un invité — le booléen sort, le `sub` jamais
 * (inscrit à `lint:auth0-id-readers`).
 *
 * Les montants rendus sont les **facturables** (`billable_*`, la somme des BL
 * remis — `OrderBilling.settlementOf`), pas ceux de la commande : un reste
 * abandonné (E6) ne rapporte pas de points (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 16).
 */
@Injectable()
export class PrismaCompletedOrderReader extends CompletedOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCompleted(orderId: string): Promise<CompletedOrder | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, ...COMPLETED_WHERE },
      select: SELECT,
    });
    return row === null ? null : toCompleted(row);
  }

  listCompleted(after: string | null, limit: number): Promise<CompletedOrderPage> {
    return this.page({}, after, limit);
  }

  listCompletedPlacedBy(
    userId: string,
    after: string | null,
    limit: number,
  ): Promise<CompletedOrderPage> {
    return this.page({ placedByUserId: userId }, after, limit);
  }

  private async page(
    scope: { readonly placedByUserId?: string },
    after: string | null,
    limit: number,
  ): Promise<CompletedOrderPage> {
    const rows = await this.prisma.order.findMany({
      // Les parcours ne rendent que les commandes SOLDÉES : une seule sans solde
      // arrêterait le lot entier ; le rapprochement la pose, la nuit suivante la reprend.
      where: {
        ...COMPLETED_WHERE,
        billableTotalCents: { not: null },
        ...scope,
        ...(after === null ? {} : { id: { gt: after } }),
      },
      select: SELECT,
      orderBy: { id: "asc" },
      take: limit,
    });
    const orders = rows.flatMap((row) => {
      const order = toCompleted(row);
      return order === null ? [] : [order];
    });
    const last = rows.at(-1);
    return { orders, nextAfter: rows.length < limit || last === undefined ? null : last.id };
  }
}

/**
 * Ligne → commande définitive. `null` pour une clientèle nulle (exclue par le
 * `where`, que le type ignore).
 *
 * @throws {CompletedOrderUnsettledError} montants facturables non posés.
 */
export function toCompleted(row: CompletedRow): CompletedOrder | null {
  // Le `where` exclut déjà la clientèle nulle ; le type Prisma ne le sait pas.
  if (row.clientele === null) {
    return null;
  }
  // Le CHECK « tout ou rien » d'`orders` pose les montants facturables ensemble.
  const { billableSubtotalCents, billableDiscountCents, billableVoucherDiscountCents } = row;
  if (
    billableSubtotalCents === null ||
    billableDiscountCents === null ||
    billableVoucherDiscountCents === null
  ) {
    throw new CompletedOrderUnsettledError(row.orderNumber);
  }
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt,
    clientele: row.clientele,
    companyId: row.companyId,
    placedByUserId: row.placedByUserId,
    buyerHasAccount: row.placedBy.auth0Sub !== null,
    subtotalCents: billableSubtotalCents,
    discountCents: billableDiscountCents,
    voucherDiscountCents: billableVoucherDiscountCents,
  };
}
