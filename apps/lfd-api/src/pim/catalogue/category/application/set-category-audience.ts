import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { CatalogReemission } from "../../shared/domain/ports/catalog-reemission.js";

export class SetCategoryAudienceCommand {
  constructor(
    readonly id: string,
    readonly audience: Audience,
  ) {}
}

/**
 * **À qui la famille vend** (1c du plan
 * `plan-catalogue-synchronise-par-audience.md`). Ses fiches en héritent, sauf
 * celles qui dérogent.
 *
 * Au lot 1, aucune émission ne lit l'audience : le geste se règle et se
 * journalise, il ne change encore rien de ce qui est servi.
 */
@CommandHandler(SetCategoryAudienceCommand)
export class SetCategoryAudienceHandler implements ICommandHandler<
  SetCategoryAudienceCommand,
  void
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: SetCategoryAudienceCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    const before = category.audience;
    const changed = category.changeAudience(command.audience);
    await this.uow.run(async () => {
      const ticket = await this.journalize(category, before, changed);
      await this.categories.save(category, ticket);
      await this.emitter.emitCategories([command.id]);
    });
    await this.reemission.productsOfCategories([command.id]);
  }

  private async journalize(
    category: Category,
    before: Audience,
    changed: boolean,
  ): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("audience de la famille inchangée");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productCategoryAudienceChanged,
      subjectType: "product_category",
      subjectId: category.id,
      payload: {
        subjectLabel: category.name.fr,
        audience: { from: before, to: category.audience },
      },
    });
  }
}
