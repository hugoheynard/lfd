import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductionContainerRepository } from "../../domain/ports/production-container.repository.js";
import { RemoveProductionContainerCommand } from "./remove-production-container.command.js";

/**
 * **Le réglage s'enlève.**
 *
 * Idempotent par construction : retirer un réglage absent rend l'état demandé,
 * et refuser n'apprendrait rien à qui a cliqué deux fois. C'est le port qui le
 * dit, l'adaptateur qui le tient.
 */
@CommandHandler(RemoveProductionContainerCommand)
export class RemoveProductionContainerHandler implements ICommandHandler<
  RemoveProductionContainerCommand,
  void
> {
  constructor(private readonly containers: ProductionContainerRepository) {}

  async execute(command: RemoveProductionContainerCommand): Promise<void> {
    await this.containers.remove(command.sku);
  }
}
