import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { SalesContextAggregate } from "../domain/entities/sales-context.entity.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { requireContext } from "./sales-context-support.js";
import { CatalogReemission } from "../../catalogue/shared/domain/ports/catalog-reemission.js";

export interface UpdateSalesContextPayload {
  readonly label: string;
  readonly active: boolean;
  readonly position: number;
}

export class UpdateSalesContextCommand {
  constructor(
    readonly key: string,
    readonly payload: UpdateSalesContextPayload,
  ) {}
}

/**
 * Règle un contexte de vente.

 */
@CommandHandler(UpdateSalesContextCommand)
export class UpdateSalesContextHandler implements ICommandHandler<UpdateSalesContextCommand, void> {
  constructor(
    private readonly contexts: SalesContextRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: UpdateSalesContextCommand): Promise<void> {
    const { key, payload } = command;
    const context = await requireContext(this.contexts, key);
    const before = traced(context);

    context.revise(payload);

    const changes = changesBetween(before, traced(context));
    await this.uow.run(async () => {
      // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
      // filtre, l'historique d'un contexte serait surtout composé de gestes qui
      // n'ont rien changé.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.salesContextUpdated,
              subjectType: "sales_context",
              subjectId: key,
              payload: { subjectLabel: context.snapshot().label, changes },
            })
          : this.journal.untraced("record without modification");
      await this.contexts.save(context, ticket);
    });
    await this.reemission.everything();
  }
}

/**
 * Ce que le journal retient d'un contexte. La clé n'y est pas : elle ne change
 * jamais, et c'est déjà le sujet du fait.
 */
function traced(context: SalesContextAggregate): Record<string, unknown> {
  const { label, active, position } = context.snapshot();
  return { label, active, position };
}
