import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { LocalizedText } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { requireCategory } from "./allergen-support.js";

export class RenameAllergenCategoryCommand {
  constructor(
    readonly id: string,
    readonly name: LocalizedText,
  ) {}
}

/**
 * Renomme une catégorie maison — le seul geste d'édition d'une catégorie.
 *
 * La clé n'y figure pas (c'est une identité) et `incoCategory` non plus : une
 * catégorie ne devient pas réglementaire par un `PUT`. Le refus sur une
 * catégorie officielle vient de l'agrégat, pas d'ici : son libellé EST la
 * mention d'étiquette.
 */
@CommandHandler(RenameAllergenCategoryCommand)
export class RenameAllergenCategoryHandler implements ICommandHandler<
  RenameAllergenCategoryCommand,
  void
> {
  constructor(
    private readonly categories: AllergenCategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenameAllergenCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    // Le libellé d'AVANT est lu avant la révision : après, l'agrégat ne s'en
    // souvient plus, et un journal qui ne dit pas d'où l'on vient ne sert à rien.
    const before = category.snapshot().name;
    category.rename(command.name);
    const after = category.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenCategoryRenamed,
        subjectType: "allergen_category",
        subjectId: after.id,
        payload: { key: after.key, from: before, to: after.name },
      });
      await this.categories.save(category, ticket);
    });
  }
}
