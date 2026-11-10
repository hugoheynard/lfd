import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { IssueCardRefundCommand } from "../commands/issue-card-refund.command.js";

const ISSUE_CARD_REFUND = "card-payment.issue-card-refund";

/**
 * **Lancer l'exécuteur après validation** — le port, pour que les gestes qui
 * écrivent une demande se doublent sans bus.
 */
export abstract class CardRefundDispatch {
  /** Après validation de la transaction ambiante, en tâche de fond. */
  abstract afterCommitFor(requestId: string): void;

  /** Tout de suite, en attendant l'issue — pour le balayage, hors transaction. */
  abstract issueNow(requestId: string): Promise<void>;
}

/**
 * L'adaptateur par le bus de commandes. Best effort, sans relance : si
 * l'exécuteur n'aboutit pas, le balayage le reprend. Inscrit APRÈS la
 * validation — une transaction ne porte jamais l'appel au prestataire.
 */
@Injectable()
export class BusCardRefundDispatch extends CardRefundDispatch {
  constructor(
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly commands: CommandBus,
  ) {
    super();
  }

  afterCommitFor(requestId: string): void {
    this.afterCommit.defer(
      () => this.work.track(this.issueNow(requestId), ISSUE_CARD_REFUND),
      ISSUE_CARD_REFUND,
    );
  }

  issueNow(requestId: string): Promise<void> {
    return this.commands.execute<IssueCardRefundCommand, void>(
      new IssueCardRefundCommand(requestId),
    );
  }
}
