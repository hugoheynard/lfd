import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { requireCategory } from "./allergen-support.js";

export class RestoreAllergenCategoryCommand {
  constructor(readonly id: string) {}
}

/**
 * Remet une catégorie maison au référentiel.
 *
 * Rien à vérifier du côté des entrées : une catégorie restaurée ne rend
 * personne visible d'office — ses allergènes archivés le restent, et se
 * restaurent un par un.
 */
@CommandHandler(RestoreAllergenCategoryCommand)
export class RestoreAllergenCategoryHandler implements ICommandHandler<
  RestoreAllergenCategoryCommand,
  void
> {
  constructor(
    private readonly categories: AllergenCategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreAllergenCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    category.restore();
    const restored = category.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenCategoryRestored,
        subjectType: "allergen_category",
        subjectId: restored.id,
        payload: { key: restored.key, name: restored.name },
      });
      await this.categories.save(category, ticket);
    });
  }
}
