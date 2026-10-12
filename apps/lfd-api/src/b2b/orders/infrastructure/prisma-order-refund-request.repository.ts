import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderRefundRequest,
  type OrderRefundRequestState,
} from "../domain/entities/order-refund-request.js";
import { RefundRequestConflictError } from "../domain/errors/order-refund-request-errors.js";
import { OrderRefundRequestRepository } from "../domain/ports/order-refund-request.repository.js";

/** Les colonnes de la demande — la même forme que l'état de l'agrégat. */
export const REFUND_REQUEST_SELECT = {
  orderId: true,
  cause: true,
  announcedCents: true,
  requestedAt: true,
  requestedBy: true,
  generation: true,
  stripeRefundId: true,
  issuedAt: true,
  attempts: true,
  lastFailure: true,
  lastAttemptAt: true,
  round: true,
  claimedUntil: true,
  claimToken: true,
  nextAttemptAt: true,
} as const;

/**
 * Adaptateur Prisma de la demande de remboursement : `load` →
 * `reconstitute`, `save` ← `toPersistence`. Par le client ROUTÉ : dans
 * l'unité de travail de l'appelant.
 *
 * Pas de mur tenant : les appelants sont l'équipe (surface admin), le
 * balayage machine et l'exécuteur — aucun ne parle au nom d'une société.
 */
@Injectable()
export class PrismaOrderRefundRequestRepository extends OrderRefundRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(orderId: string): Promise<OrderRefundRequest | null> {
    const row = await this.prisma.orderRefundRequest.findUnique({
      where: { orderId },
      select: REFUND_REQUEST_SELECT,
    });
    return row === null ? null : OrderRefundRequest.reconstitute(row);
  }

  async save(request: OrderRefundRequest): Promise<void> {
    const { state, expected } = request.toPersistence();
    if (expected === null) {
      await this.prisma.orderRefundRequest.create({ data: state });
      return;
    }
    const { orderId, ...columns } = state;
    // Conditionnée par la génération ET le jeton chargés : un exécuteur dont le
    // bail a expiré, ou qui a vu passer une génération, n'écrit rien (C4.7, 3).
    const written = await this.prisma.orderRefundRequest.updateMany({
      where: { orderId, generation: expected.generation, claimToken: expected.claimToken },
      data: columns satisfies Omit<OrderRefundRequestState, "orderId">,
    });
    if (written.count !== 1) {
      throw new RefundRequestConflictError(orderId);
    }
  }
}
