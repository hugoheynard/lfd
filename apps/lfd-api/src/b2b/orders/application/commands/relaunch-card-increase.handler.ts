import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import { NoStalledComplementError } from "../../domain/errors/card-increase-application-errors.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { CardIncreaseWake } from "../../domain/ports/card-increase-wake.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { increaseRelaunchedFact } from "../services/card-increase-facts.js";
import { IncreaseOrderLabels } from "../services/increase-order-labels.js";
import { RelaunchCardIncreaseCommand } from "./relaunch-card-increase.command.js";

/**
 * **« Relancer »** (doc `modifier-une-commande.md`, §2.7.5 étape 5) : sous
 * `orders` puis le projet, `stalled → ready` (l'agrégat remet les essais à
 * zéro), le journal `_relaunched`, et l'exécuteur réveillé APRÈS validation.
 * L'échéance se pose au MUR : le bail et le balayage l'y comparent.
 *
 * @throws {NoStalledComplementError} aucun complément en panne sur cette commande.
 */
@CommandHandler(RelaunchCardIncreaseCommand)
export class RelaunchCardIncreaseHandler implements ICommandHandler<RelaunchCardIncreaseCommand> {
  constructor(
    private readonly lock: OrderLock,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly labels: IncreaseOrderLabels,
    private readonly journal: Journal,
    private readonly wake: CardIncreaseWake,
    private readonly afterCommit: AfterCommit,
    private readonly unitOfWork: UnitOfWork,
    private readonly wall: WallClock,
  ) {}

  execute(command: RelaunchCardIncreaseCommand): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.lock.lock(command.orderId);
      const live = await this.proposals.lockLiveOf(command.orderId);
      if (live?.state !== "stalled") {
        throw new NoStalledComplementError(command.orderId);
      }
      live.relaunch(this.wall.elapsedNow());
      if (!(await this.proposals.save(live))) {
        throw new NoStalledComplementError(command.orderId);
      }
      await this.journal.append(
        increaseRelaunchedFact(live, await this.labels.of(command.orderId)),
      );
      const id = live.id;
      this.afterCommit.defer(() => this.wake.wake(id), `card-increase.wake:${id}`);
    });
  }
}
