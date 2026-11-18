import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { SalesContextLock } from "../domain/ports/sales-context.lock.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { requireContext } from "./sales-context-support.js";

export class RestoreSalesContextCommand {
  constructor(readonly key: string) {}
}

/**
 * Remet un contexte archivé au registre, dans l'état de service qu'il avait.
 * Rejoué sur un contexte non archivé : ni écriture, ni fait, ni réémission.
 *
 * Chargé dans la transaction sous le verrou exclusif du contexte, et seul
 * `archived_at` est écrit : une mise à jour concurrente n'est pas effacée.
 */
@CommandHandler(RestoreSalesContextCommand)
export class RestoreSalesContextHandler implements ICommandHandler<
  RestoreSalesContextCommand,
  void
> {
  constructor(
    private readonly contexts: SalesContextRepository,
    private readonly lock: SalesContextLock,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: RestoreSalesContextCommand): Promise<void> {
    const restored = await this.uow.run(async () => {
      await this.lock.forArchival(command.key);
      const context = await requireContext(this.contexts, command.key);
      if (!context.restore()) {
        return false;
      }
      const { key, label } = context.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.salesContextRestored,
        subjectType: "sales_context",
        subjectId: key,
        payload: { subjectLabel: label, key, label },
      });
      await this.contexts.saveArchival(context, ticket);
      return true;
    });
    if (!restored) {
      return;
    }
    await this.reemission.everything();
  }
}
