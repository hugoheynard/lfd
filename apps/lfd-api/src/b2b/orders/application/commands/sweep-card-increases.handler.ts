import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CardPayments } from "../../../../card-payment/channels/requests/index.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseSweepReader } from "../../domain/ports/card-increase-sweep.reader.js";
import { CardIncreaseDispatch } from "../services/card-increase-dispatch.js";
import { CardIncreaseProviderChecks } from "../services/card-increase-provider-checks.js";
import {
  CARD_INCREASE_SWEEP_LIMIT,
  type CardIncreaseSweepReport,
  PROVIDER_CHECK_AFTER_MS,
  SweepCardIncreasesCommand,
} from "./sweep-card-increases.command.js";

/**
 * **Le balayage des hausses** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5, §2.7.7),
 * hors de toute transaction, un projet à la fois — l'échec de l'un ne prive
 * pas les suivants de leur tour :
 *
 * 1. les projets `ready` dont l'essai est dû : l'exécuteur, qui prend son
 *    bail (un réveil perdu, une panne à reprendre) ;
 * 2. les projets `awaiting_payment` nés il y a plus de cinq minutes et encore
 *    dans leur délai : la vérification chez le prestataire
 *    (`settleFromProvider`), qui rejoue le chemin du webhook si l'intention
 *    est payée. Un échec compte (`provider_checks`), la cloche au 3ᵉ.
 *
 * Les échéances se comparent à l'horloge MURALE : celle de la requête du cron
 * est gelée.
 *
 * @sans-journal Il n'écrit rien lui-même : l'exécuteur, le webhook rejoué et
 * le compte des contrôles journalisent chacun leur transition.
 */
@CommandHandler(SweepCardIncreasesCommand)
export class SweepCardIncreasesHandler implements ICommandHandler<
  SweepCardIncreasesCommand,
  CardIncreaseSweepReport
> {
  private readonly logger = new Logger(SweepCardIncreasesHandler.name);

  constructor(
    private readonly sweeps: CardIncreaseSweepReader,
    private readonly reader: CardIncreaseProposalReader,
    private readonly cards: CardPayments,
    private readonly checks: CardIncreaseProviderChecks,
    private readonly dispatch: CardIncreaseDispatch,
    private readonly wall: WallClock,
  ) {}

  async execute(): Promise<CardIncreaseSweepReport> {
    const now = this.wall.elapsedNow();
    const due = await this.sweeps.dueForApply(now, CARD_INCREASE_SWEEP_LIMIT);
    for (const proposalId of due) {
      await this.apply(proposalId);
    }
    const bornBefore = new Date(now.getTime() - PROVIDER_CHECK_AFTER_MS);
    const awaiting = await this.sweeps.awaitingSince(bornBefore, now, CARD_INCREASE_SWEEP_LIMIT);
    for (const proposalId of awaiting) {
      await this.check(proposalId);
    }
    return { applied: due.length, checked: awaiting.length };
  }

  private async apply(proposalId: string): Promise<void> {
    try {
      await this.dispatch.applyNow(proposalId);
    } catch (error) {
      this.logger.error(`Hausse non reprise (projet ${proposalId})`, error);
    }
  }

  /** Hors transaction : le prestataire relu ; un échec compte, il ne lève pas. */
  private async check(proposalId: string): Promise<void> {
    const proposal = await this.reader.find(proposalId);
    if (proposal?.state !== "awaiting_payment") {
      return;
    }
    const { paymentId, orderId } = proposal.toPersistence();
    try {
      await this.cards.settleFromProvider(paymentId);
    } catch (error) {
      this.logger.warn(`Complément non vérifié chez le prestataire (projet ${proposalId})`, error);
      await this.checks.recordFailure(proposalId, orderId);
    }
  }
}
