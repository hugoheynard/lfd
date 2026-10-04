import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OutboxRelay, type OutboxSweepReport } from "./outbox-relay.js";
import { SweepOutboxCommand } from "./sweep-outbox.command.js";

/**
 * Le rattrapage : ce que le chemin rapide n'a pas livré — processus endormi
 * ou mort après la validation, abonné en échec dont le délai est échu.
 *
 * @sans-journal geste machine, idempotent ; le compte rendu est sa trace.
 */
@CommandHandler(SweepOutboxCommand)
export class SweepOutboxHandler implements ICommandHandler<SweepOutboxCommand, OutboxSweepReport> {
  constructor(private readonly relay: OutboxRelay) {}

  execute(): Promise<OutboxSweepReport> {
    return this.relay.sweep();
  }
}
