import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { requireCategory } from "./allergen-support.js";

export class MoveAllergenCategoryCommand {
  constructor(
    readonly id: string,
    readonly position: number,
  ) {}
}

/**
 * Range une catégorie dans l'écran.
 *
 * **Le seul geste qu'une catégorie OFFICIELLE accepte**, et c'est écrit dans le
 * trigger comme dans l'agrégat : l'ordre d'affichage n'a aucune portée
 * réglementaire, et une catégorie qu'on ne pourrait pas déplacer transformerait
 * le droit en contrainte d'ergonomie.
 *
 * Un rang par geste, et non une fratrie entière renumérotée comme pour les
 * familles du catalogue : les catégories d'allergène sont une liste plate d'une
 * quinzaine de lignes, et exiger l'ordre complet obligerait l'écran à renvoyer
 * quinze identifiants pour en déplacer un.
 */
@CommandHandler(MoveAllergenCategoryCommand)
export class MoveAllergenCategoryHandler implements ICommandHandler<
  MoveAllergenCategoryCommand,
  void
> {
  constructor(
    private readonly categories: AllergenCategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MoveAllergenCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    const before = category.snapshot().position;
    category.moveTo(command.position);
    const after = category.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenCategoryReordered,
        subjectType: "allergen_category",
        subjectId: after.id,
        payload: { key: after.key, from: before, to: after.position },
      });
      await this.categories.save(category, ticket);
    });
  }
}
