import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ProductionContainerRemovedEvent } from "../../domain/events/production-container.events.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "../../domain/ports/production-container.repository.js";
import { RemoveProductionContainerCommand } from "./remove-production-container.command.js";

/**
 * **Le réglage s'enlève.**
 *
 * Idempotent par construction : retirer un réglage absent rend l'état demandé,
 * et refuser n'apprendrait rien à qui a cliqué deux fois. C'est le port qui le
 * dit, l'adaptateur qui le tient.
 *
 * Journalisé dans la transaction du retrait, avec ce que le réglage valait
 * (depuis le 2026-09-19) : la ligne disparaît, le fait la garde. Retirer un
 * réglage absent reste un succès SANS fait — un « retiré » sur un contenant qui
 * n'existait pas mentirait au lecteur.
 */
@CommandHandler(RemoveProductionContainerCommand)
export class RemoveProductionContainerHandler implements ICommandHandler<
  RemoveProductionContainerCommand,
  void
> {
  constructor(
    private readonly containers: ProductionContainerRepository,
    private readonly current: ProductionContainerReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveProductionContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = (await this.current.allBySku()).get(command.sku) ?? null;
      await this.containers.remove(command.sku);
      if (before !== null) {
        await this.events.publishTraced(new ProductionContainerRemovedEvent(command.sku, before));
      }
    });
  }
}
