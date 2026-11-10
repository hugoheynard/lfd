import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import type { CardRefundRequest } from "../domain/entities/card-refund-request.js";
import { CardRefundRequestConflictError } from "../domain/errors/card-refund-errors.js";
import { CardRefundRequestRepository } from "../domain/ports/card-refund-request.repository.js";
import { requestOf } from "./card-refund-rows.js";

/**
 * **Les demandes de remboursement**, dans `card_payment.refund_request` —
 * l'écrivain UNIQUE de la table (`lint:prisma-model-ownership`). Par le client
 * ambiant : dans l'unité de travail de l'appelant.
 *
 * Les gardes que la base porte en plus (la machine, les colonnes immuables,
 * une seule `remainder` en cours par paiement) sont dans la migration
 * `20261110010100_…` : une écriture qui les franchirait échouerait, et c'est
 * voulu — le code ne la tente jamais (l'agrégat refuse avant).
 *
 * Pas de mur tenant : les appelants sont l'équipe, le balayage machine, le
 * webhook signé et le sujet par son canal — aucun ne parle au nom d'une société.
 */
@Injectable()
export class PrismaCardRefundRequestRepository extends CardRefundRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async paymentOf(requestId: string): Promise<string | null> {
    const row = await this.prisma.cardRefundRequest.findUnique({
      where: { id: requestId },
      select: { paymentId: true },
    });
    return row?.paymentId ?? null;
  }

  async load(requestId: string): Promise<CardRefundRequest | null> {
    if (currentTransaction() !== undefined) {
      await this.prisma.$queryRaw`
        SELECT "id" FROM "card_payment"."refund_request" WHERE "id" = ${requestId} FOR UPDATE`;
    }
    const row = await this.prisma.cardRefundRequest.findUnique({ where: { id: requestId } });
    return row === null ? null : requestOf(row);
  }

  async ofPayment(paymentId: string): Promise<readonly CardRefundRequest[]> {
    const rows = await this.prisma.cardRefundRequest.findMany({
      where: { paymentId },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(requestOf);
  }

  async save(request: CardRefundRequest): Promise<void> {
    const { state, expected } = request.toPersistence();
    if (expected === null) {
      await this.prisma.cardRefundRequest.create({ data: state });
      return;
    }
    const { id, ...columns } = state;
    // Conditionnée par la génération ET le jeton chargés : un exécuteur dont le
    // bail a expiré, ou qui a vu passer une génération, n'écrit rien.
    const written = await this.prisma.cardRefundRequest.updateMany({
      where: { id, generation: expected.generation, claimToken: expected.claimToken },
      data: columns,
    });
    if (written.count !== 1) {
      throw new CardRefundRequestConflictError(id);
    }
  }

  async transition(request: CardRefundRequest): Promise<boolean> {
    const { state, expected } = request.toPersistence();
    if (expected === null) {
      await this.save(request);
      return true;
    }
    // Le bail n'est pas à nous : ni `claimed_until` ni `claim_token` ne bougent.
    const { id, claimedUntil: _until, claimToken: _token, ...columns } = state;
    const written = await this.prisma.cardRefundRequest.updateMany({
      where: { id, state: expected.state, generation: expected.generation },
      data: columns,
    });
    return written.count === 1;
  }
}
