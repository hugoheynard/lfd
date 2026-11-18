import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { SalesContextLock } from "../domain/ports/sales-context.lock.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { SalesContextUsageReader } from "../domain/ports/sales-context-usage.reader.js";
import { requireContext } from "./sales-context-support.js";

export class ArchiveSalesContextCommand {
  constructor(readonly key: string) {}
}

/**
 * Archive un contexte de vente : il ne se propose plus, ni au réglage d'un
 * taux, ni à la facturation. On ne supprime plus un contexte, même jamais
 * utilisé (décision de Hugo du 2026-11-18).
 *
 * Les deux refus sont ceux de l'agrégat (`SalesContextAggregate.archive`) : la
 * racine, et un contexte qui porte encore des taux. Tout se passe dans la
 * transaction, sous le verrou exclusif du contexte (`SalesContextLock`) : une
 * pose de taux en cours finit avant que l'archive compte, une pose qui suit ne
 * le voit plus proposé et refuse. Le contexte est chargé APRÈS le verrou, et
 * seul `archived_at` est écrit : une mise à jour concurrente n'est pas
 * effacée. Rejoué sur un contexte archivé : ni écriture, ni fait, ni
 * réémission.
 */
@CommandHandler(ArchiveSalesContextCommand)
export class ArchiveSalesContextHandler implements ICommandHandler<
  ArchiveSalesContextCommand,
  void
> {
  constructor(
    private readonly contexts: SalesContextRepository,
    private readonly lock: SalesContextLock,
    private readonly usage: SalesContextUsageReader,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: ArchiveSalesContextCommand): Promise<void> {
    const archived = await this.uow.run(async () => {
      await this.lock.forArchival(command.key);
      const context = await requireContext(this.contexts, command.key);
      const { id, key, label } = context.snapshot();
      if (!context.archive(this.clock.now(), await this.usage.ratedBy(id))) {
        return false;
      }
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.salesContextArchived,
        subjectType: "sales_context",
        subjectId: key,
        payload: { subjectLabel: label, key, label },
      });
      await this.contexts.saveArchival(context, ticket);
      return true;
    });
    if (archived) {
      await this.reemission.everything();
    }
  }
}
