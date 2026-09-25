import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogOperationOverride } from "../../domain/entities/catalog-operation-override.js";
import { CatalogOperationNotFoundError } from "../../domain/errors/catalog-operation-errors.js";
import { CatalogOperationOverrideSetEvent } from "../../domain/events/catalog-operation.events.js";
import { CatalogOperationOverrideRepository } from "../../domain/ports/catalog-operation-override.repository.js";
import { CatalogOperationRepository } from "../../domain/ports/catalog-operation.repository.js";
import { SetOperationOverrideCommand } from "./set-operation-override.command.js";

/**
 * Pose la surcharge d'une opération reçue — le cycle de la maison : charger,
 * décider par l'agrégat, rendre au port, journaliser dans la même unité.
 *
 * Deux gardes seulement. L'opération doit avoir été REÇUE — retirée comprise :
 * une opération retirée se relit, et la restreindre reste un geste qui a un
 * sens le jour où elle revient. La forme, ensuite, que l'agrégat tient. Rien
 * n'est confronté aux dates du référentiel (D9) : la combinaison se fait à la
 * lecture.
 *
 * Un geste sans effet — enregistrer ce qui était déjà décidé — n'écrit pas de
 * fait, comme pour un article masqué deux fois.
 */
@CommandHandler(SetOperationOverrideCommand)
export class SetOperationOverrideHandler implements ICommandHandler<
  SetOperationOverrideCommand,
  void
> {
  constructor(
    private readonly operations: CatalogOperationRepository,
    private readonly overrides: CatalogOperationOverrideRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetOperationOverrideCommand): Promise<void> {
    const operation = await this.operations.load(command.operationKey);
    if (operation === null) {
      throw new CatalogOperationNotFoundError(command.operationKey);
    }
    const decidedAt = this.clock.now();
    await this.uow.run(async () => {
      const known = await this.overrides.load(command.operationKey);
      const override =
        known ??
        CatalogOperationOverride.decide(
          command.operationKey,
          command.restriction,
          command.decidedBy,
          decidedAt,
        );
      const changed =
        known === null || known.redecide(command.restriction, command.decidedBy, decidedAt);
      if (!changed) {
        return;
      }
      await this.overrides.save(override);
      await this.events.publishTraced(
        new CatalogOperationOverrideSetEvent(
          { key: operation.key, name: operation.received.name.fr },
          override.restriction,
        ),
      );
    });
  }
}
