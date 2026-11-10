import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type {
  CardIncreaseProposal,
  CardIncreaseProposalState,
  FrozenIncreaseContent,
  FrozenIncreaseRules,
} from "../domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalRepository } from "../domain/ports/card-increase-proposal.repository.js";
import { authorColumnsOf, proposalOf } from "./card-increase-proposal.row.js";

/**
 * Adaptateur Prisma de `order_revision_proposal`, par le client routé : il
 * rejoint l'unité de travail ambiante. `FOR UPDATE` en SQL d'abord, lecture
 * typée ensuite — la figure de `PrismaOrderRevisionRepository.lock`.
 */
@Injectable()
export class PrismaCardIncreaseProposalRepository extends CardIncreaseProposalRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockByPayment(paymentId: string): Promise<CardIncreaseProposal | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."order_revision_proposal"
      WHERE "payment_id" = ${paymentId}
      FOR UPDATE`;
    return this.read(locked);
  }

  async lockLiveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."order_revision_proposal"
      WHERE "order_id" = ${orderId}
        AND "state" IN ('awaiting_payment', 'ready', 'stalled')
      FOR UPDATE`;
    return this.read(locked);
  }

  async save(proposal: CardIncreaseProposal): Promise<boolean> {
    const state = proposal.toPersistence();
    if (proposal.expectedState === null) {
      await this.prisma.orderRevisionProposal.create({ data: insertOf(state) });
      return true;
    }
    const written = await this.prisma.orderRevisionProposal.updateMany({
      where: { id: state.id, state: proposal.expectedState },
      data: mutableOf(state),
    });
    return written.count === 1;
  }

  private async read(locked: readonly { readonly id: string }[]) {
    const [first] = locked;
    if (first === undefined) {
      return null;
    }
    const row = await this.prisma.orderRevisionProposal.findUniqueOrThrow({
      where: { id: first.id },
    });
    return proposalOf(row);
  }
}

/** Ce qu'une transition peut réécrire ; le reste est figé à la naissance. */
function mutableOf(state: CardIncreaseProposalState) {
  return {
    state: state.state,
    attempts: state.attempts,
    nextAttemptAt: state.nextAttemptAt,
    leasedUntil: state.leasedUntil,
    lastFailure: state.lastFailure,
    providerChecks: state.providerChecks,
    refusal: state.refusal,
    settledAt: state.settledAt,
    closedAt: state.closedAt,
  };
}

function insertOf(state: CardIncreaseProposalState) {
  return {
    ...mutableOf(state),
    id: state.id,
    orderId: state.orderId,
    baseRevision: state.baseRevision,
    content: jsonOf(state.content),
    rules: jsonOf(state.rules),
    targetTotalCents: state.targetTotalCents,
    complementCents: state.complementCents,
    ...authorColumnsOf(state.author),
    paymentId: state.paymentId,
    expiresAt: state.expiresAt,
    createdAt: state.createdAt,
  };
}

/** Une copie JSON plate : ce que `jsonb` garde. */
function jsonOf(value: FrozenIncreaseContent | FrozenIncreaseRules): object {
  return { ...value };
}
