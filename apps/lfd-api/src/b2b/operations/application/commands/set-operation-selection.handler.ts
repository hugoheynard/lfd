import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { UnknownOperationSkusError } from "../../domain/errors/operation-errors.js";
import { OperationSelectionSavedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationSkuCatalogue } from "../../domain/ports/operation-sku.catalogue.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { ensureWritingOpen, requireOperation, subjectOf } from "./operation-writing.js";
import { SetOperationSelectionCommand } from "./set-operation-selection.command.js";

/**
 * **Pose la sélection** d'une opération, parmi les SKU que le commerce
 * connaît (O2). Retirer un article, que `hiddenSkus` de la surcharge portait,
 * est ce geste-là.
 *
 * L'agrégat juge d'abord la liste (doublon, taille) ; le catalogue dit ensuite
 * si chaque SKU désigne un article. Dans cet ordre parce qu'une liste qui se
 * contredit n'a pas besoin d'une lecture pour être refusée.
 */
@CommandHandler(SetOperationSelectionCommand)
export class SetOperationSelectionHandler implements ICommandHandler<
  SetOperationSelectionCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly catalogue: OperationSkuCatalogue,
    private readonly writing: OperationWritingSwitch,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetOperationSelectionCommand): Promise<void> {
    ensureWritingOpen(this.writing);
    const operation = await requireOperation(this.operations, command.key);
    const from = operation.snapshot().skus;
    operation.select(command.skus, { by: command.writtenBy, at: this.clock.now() });
    const after = operation.snapshot();
    const unknown = await this.catalogue.unknownAmong(after.skus);
    if (unknown.length > 0) {
      throw new UnknownOperationSkusError(unknown);
    }
    if (sameOrder(from, after.skus)) {
      return;
    }

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(
        new OperationSelectionSavedEvent(subjectOf(after), from, after.skus),
      );
    });
  }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((sku, index) => sku === b[index]);
}
