import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { UnknownOperationSkusError } from "../domain/errors/operation-errors.js";
import { OperationSkuCatalogue } from "../domain/ports/operation-sku.catalogue.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { requireOperation } from "./operation-support.js";

export class SetOperationSelectionCommand {
  constructor(
    readonly key: string,
    readonly skus: readonly string[],
  ) {}
}

/**
 * **Pose la sélection** d'une opération : la liste entière, dans l'ordre du
 * rayon.
 *
 * L'agrégat juge d'abord la liste (doublon, taille) ; le catalogue dit ensuite
 * si chaque SKU désigne un article. Dans cet ordre parce qu'une liste qui se
 * contredit n'a pas besoin d'une lecture pour être refusée.
 *
 * ⚠️ Ce geste ne restreint pas encore la vente : tant que les lots 2 + 3 ne
 * sont pas en ligne, un article sélectionné reste un article courant (plan,
 * « Le découpage »).
 */
@CommandHandler(SetOperationSelectionCommand)
export class SetOperationSelectionHandler implements ICommandHandler<
  SetOperationSelectionCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly catalogue: OperationSkuCatalogue,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetOperationSelectionCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const from = operation.snapshot().skus;
    operation.select(command.skus);
    const after = operation.snapshot();
    const unknown = await this.catalogue.unknownAmong(after.skus);
    if (unknown.length > 0) {
      throw new UnknownOperationSkusError(unknown);
    }
    if (sameOrder(from, after.skus)) {
      return;
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationSelectionSaved,
        subjectType: "operation",
        subjectId: after.key,
        payload: { subjectLabel: after.name.fr, skus: { from: [...from], to: [...after.skus] } },
      });
      await this.operations.save(operation, ticket);
    });
  }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((sku, index) => sku === b[index]);
}
