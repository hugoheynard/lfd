import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { SalesContextAggregate } from "../domain/entities/sales-context.entity.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { ensureHandleFree, requireContext } from "./sales-context-support.js";

export interface UpdateSalesContextPayload {
  readonly label: string;
  readonly handleSuffix: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
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
  ) {}

  async execute(command: UpdateSalesContextCommand): Promise<void> {
    const { key, payload } = command;
    const context = await requireContext(this.contexts, key);
    const before = traced(context);

    context.revise(payload);
    await ensureHandleFree(this.contexts, context.snapshot());

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
              payload: { changes },
            })
          : this.journal.untraced("record without modification");
      await this.contexts.save(context, ticket);
    });
  }
}

/**
 * Ce que le journal retient d'un contexte. La clé n'y est pas : elle ne change
 * jamais, et c'est déjà le sujet du fait.
 */
function traced(context: SalesContextAggregate): Record<string, unknown> {
  const { label, handleSuffix, active, shopifyProjected, position } = context.snapshot();
  return { label, handleSuffix, active, shopifyProjected, position };
}
