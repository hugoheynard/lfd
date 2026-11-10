import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import {
  type CardIncreaseProposal,
  type CardIncreaseState,
  LIVE_CARD_INCREASE_STATES,
} from "../domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalReader } from "../domain/ports/card-increase-proposal.reader.js";
import { proposalOf } from "./card-increase-proposal.row.js";

const APPLIED: CardIncreaseState = "applied";

/** Lecture sans verrou de `order_revision_proposal` — l'index unique partiel garantit un vivant au plus. */
@Injectable()
export class PrismaCardIncreaseProposalReader extends CardIncreaseProposalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    const row = await this.prisma.orderRevisionProposal.findFirst({
      where: { orderId, state: { in: [...LIVE_CARD_INCREASE_STATES] } },
    });
    return row === null ? null : proposalOf(row);
  }

  async find(proposalId: string): Promise<CardIncreaseProposal | null> {
    const row = await this.prisma.orderRevisionProposal.findUnique({ where: { id: proposalId } });
    return row === null ? null : proposalOf(row);
  }

  async appliedPaymentsOf(orderId: string): Promise<readonly string[]> {
    const rows = await this.prisma.orderRevisionProposal.findMany({
      where: { orderId, state: APPLIED },
      select: { paymentId: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => row.paymentId);
  }
}
