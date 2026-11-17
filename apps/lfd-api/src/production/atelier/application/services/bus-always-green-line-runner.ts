import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { ServiceDay } from "../../../day/index.js";
import { AlwaysGreenLineRunner } from "../../domain/ports/always-green-line-runner.js";
import type { AlwaysGreenLineOutcome } from "../../domain/services/always-green.js";
import { RunAlwaysGreenLineCommand } from "../commands/run-always-green-line.command.js";

/** Le tour envoie la commande de chaque ligne sur le bus — la forme de `BusAutomaticDayCloser`. */
@Injectable()
export class BusAlwaysGreenLineRunner extends AlwaysGreenLineRunner {
  constructor(private readonly commands: CommandBus) {
    super();
  }

  run(day: ServiceDay, sku: string): Promise<AlwaysGreenLineOutcome> {
    return this.commands.execute<RunAlwaysGreenLineCommand, AlwaysGreenLineOutcome>(
      new RunAlwaysGreenLineCommand(day.value, sku),
    );
  }
}
