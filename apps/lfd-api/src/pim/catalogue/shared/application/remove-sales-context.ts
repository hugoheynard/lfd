import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { requireContext } from "./sales-context-support.js";

export class RemoveSalesContextCommand {
  constructor(readonly key: string) {}
}

/**
 * Efface un contexte de vente — **sauf** s'il est racine, ou si quelque chose
 * le retient encore.
 *
 * Deux refus, à deux endroits, et ce n'est pas une redondance :
 *
 * - **la racine** est refusée par l'agrégat, parce que c'est une règle du
 *   domaine qu'aucune base ne connaît. Sans le contexte B2B, la plateforme
 *   professionnelle cesse de facturer sans qu'une erreur soit levée ;
 * - **ce qui le retient** est refusé par la BASE. Trois tables le citent par
 *   clé étrangère et deux par identifiant ; une lecture préalable ne tiendrait
 *   pas, puisqu'une grille peut se mettre à le vendre entre le compte et la
 *   suppression.
 *
 * Le ticket est pris avant la suppression, mais dans la MÊME transaction : un
 * refus emporte la trace avec lui.
 */
@CommandHandler(RemoveSalesContextCommand)
export class RemoveSalesContextHandler implements ICommandHandler<RemoveSalesContextCommand, void> {
  constructor(
    private readonly contexts: SalesContextRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveSalesContextCommand): Promise<void> {
    const context = await requireContext(this.contexts, command.key);
    context.refuseRemovalIfRoot();
    const { key, label, perLocation } = context.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.salesContextDeleted,
        subjectType: "sales_context",
        subjectId: key,
        // Après elle, la ligne n'est plus interrogeable : le journal est le seul
        // endroit où ce contexte a encore un nom.
        payload: { key, label, perLocation },
      });
      await this.contexts.remove(key, ticket);
    });
  }
}
