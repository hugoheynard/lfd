import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { ApplyCardIncreaseCommand } from "../commands/apply-card-increase.command.js";

/**
 * **Lancer l'exécuteur des hausses tout de suite, en attendant l'issue** —
 * pour le balayage, hors transaction (la figure de `CardRefundDispatch.issueNow`).
 * Le port, pour que le balayage se double sans bus.
 */
export abstract class CardIncreaseDispatch {
  abstract applyNow(proposalId: string): Promise<void>;
}

/** L'adaptateur par le bus de commandes. */
@Injectable()
export class BusCardIncreaseDispatch extends CardIncreaseDispatch {
  constructor(private readonly commands: CommandBus) {
    super();
  }

  applyNow(proposalId: string): Promise<void> {
    return this.commands.execute<ApplyCardIncreaseCommand, void>(
      new ApplyCardIncreaseCommand(proposalId),
    );
  }
}
