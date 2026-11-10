import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CardPayments } from "../../../../../card-payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { WallClock } from "../../../../../platform/time/wall-clock.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import { CardComplementJustPaidError } from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseSweepReader } from "../../domain/ports/card-increase-sweep.reader.js";
import { OrderLock } from "../../../domain/ports/order-lock.js";
import { CardIncreaseAbandonment } from "../services/card-increase-abandonment.js";
import { CardIncreaseProviderChecks } from "../services/card-increase-provider-checks.js";
import { IncreaseOrderLabels } from "../../../application/services/increase-order-labels.js";
import {
  type CardIncreaseExpiryReport,
  ExpireCardIncreasesCommand,
} from "./expire-card-increases.command.js";
import { CARD_INCREASE_SWEEP_LIMIT } from "./sweep-card-increases.command.js";

type ExpiryOutcome = "abandoned" | "settled" | "retried" | "skipped";

/**
 * **L'abandon par le délai** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.7) — les
 * projets `awaiting_payment` dont le délai est passé, un à la fois, hors
 * transaction pour le prestataire. Les cinq issues de `cards.cancel` :
 *
 * | issue                            | suite                                                         |
 * | -------------------------------- | ------------------------------------------------------------- |
 * | `cancelled`, `already_cancelled` | sous `orders`, le projet `abandoned` (cause `expired`)        |
 * | `already_paid`                   | `settleFromProvider` : le chemin payé rejoué, projet `ready`  |
 * | `in_progress`                    | réessai au passage suivant                                    |
 * | `unavailable`                    | réessai, `provider_checks + 1` ; au troisième, la cloche      |
 *
 * Le délai est un plancher, pas un couperet : un paiement validé avant
 * l'écriture de `abandoned` s'applique — l'écriture conditionnée le voit.
 *
 * @sans-journal Il n'écrit rien lui-même : l'abandon (`CardIncreaseAbandonment`),
 * le webhook rejoué et le compte des contrôles journalisent leur transition.
 */
@CommandHandler(ExpireCardIncreasesCommand)
export class ExpireCardIncreasesHandler implements ICommandHandler<
  ExpireCardIncreasesCommand,
  CardIncreaseExpiryReport
> {
  private readonly logger = new Logger(ExpireCardIncreasesHandler.name);

  constructor(
    private readonly sweeps: CardIncreaseSweepReader,
    private readonly reader: CardIncreaseProposalReader,
    private readonly cards: CardPayments,
    private readonly abandonment: CardIncreaseAbandonment,
    private readonly checks: CardIncreaseProviderChecks,
    private readonly labels: IncreaseOrderLabels,
    private readonly lock: OrderLock,
    private readonly unitOfWork: UnitOfWork,
    private readonly wall: WallClock,
  ) {}

  async execute(): Promise<CardIncreaseExpiryReport> {
    const expired = await this.sweeps.expired(this.wall.elapsedNow(), CARD_INCREASE_SWEEP_LIMIT);
    const counts = { abandoned: 0, settled: 0, retried: 0 };
    for (const proposalId of expired) {
      const outcome = await this.expireOne(proposalId).catch((error: unknown) => {
        this.logger.error(`Complément échu non traité (projet ${proposalId})`, error);
        return "retried" as const;
      });
      if (outcome !== "skipped") {
        counts[outcome] += 1;
      }
    }
    return counts;
  }

  private async expireOne(proposalId: string): Promise<ExpiryOutcome> {
    const proposal = await this.reader.find(proposalId);
    if (proposal?.state !== "awaiting_payment") {
      return "skipped";
    }
    const { paymentId, orderId } = proposal.toPersistence();
    const outcome = await this.cards.cancel(paymentId);
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return this.abandon(proposal);
      case "already_paid":
        return this.settle(proposal);
      case "in_progress":
        return "retried";
      case "unavailable":
        this.logger.warn(
          `Complément échu, prestataire muet (projet ${proposalId}) : ${outcome.reason}`,
        );
        await this.checks.recordFailure(proposalId, orderId);
        return "retried";
    }
  }

  /** Payé chez le prestataire : le chemin du webhook rejoué ; un échec compte comme un contrôle. */
  private async settle(proposal: CardIncreaseProposal): Promise<ExpiryOutcome> {
    const { paymentId, orderId } = proposal.toPersistence();
    try {
      await this.cards.settleFromProvider(paymentId);
      return "settled";
    } catch (error) {
      this.logger.warn(`Complément payé non vérifié (projet ${proposal.id})`, error);
      await this.checks.recordFailure(proposal.id, orderId);
      return "retried";
    }
  }

  /** Sous `orders`, l'écriture conditionnée ; payé entre-temps, le projet suit son cours. */
  private async abandon(proposal: CardIncreaseProposal): Promise<ExpiryOutcome> {
    const orderId = proposal.toPersistence().orderId;
    try {
      await this.unitOfWork.run(async () => {
        await this.lock.lock(orderId);
        await this.abandonment.abandonLocked(proposal, await this.labels.of(orderId), "expired");
      });
      return "abandoned";
    } catch (error) {
      if (error instanceof CardComplementJustPaidError) {
        return "skipped";
      }
      throw error;
    }
  }
}
