import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { IssueOrderRefundCommand } from "../commands/issue-order-refund.command.js";

const ISSUE_ORDER_REFUND = "orders.issue-order-refund";

/**
 * **Lancer l'exécuteur des remboursements après validation** — le port, pour
 * que les gestes qui écrivent une demande se doublent sans bus.
 */
export abstract class OrderRefundDispatch {
  /** Après validation de la transaction ambiante, en tâche de fond. */
  abstract afterCommitFor(orderId: string): void;

  /** Tout de suite, en attendant l'issue — pour le balayage, hors transaction. */
  abstract issueNow(orderId: string): Promise<void>;
}

/**
 * L'adaptateur par le bus de commandes (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.3, C4.7 (a), (c)).
 *
 * Best effort, sans relance : si l'exécuteur n'aboutit pas, le balayage du
 * cron le reprend. Inscrit APRÈS la validation — un abonné durable ou une
 * transaction ne porte jamais l'appel à Stripe (`vitruve`, BLOQUANT 1).
 */
@Injectable()
export class BusOrderRefundDispatch extends OrderRefundDispatch {
  constructor(
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly commands: CommandBus,
  ) {
    super();
  }

  afterCommitFor(orderId: string): void {
    this.afterCommit.defer(
      () => this.work.track(this.issueNow(orderId), ISSUE_ORDER_REFUND),
      ISSUE_ORDER_REFUND,
    );
  }

  issueNow(orderId: string): Promise<void> {
    return this.commands.execute<IssueOrderRefundCommand, void>(
      new IssueOrderRefundCommand(orderId),
    );
  }
}
