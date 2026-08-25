import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryArchivedParentError } from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { assertNoCycle } from "../domain/services/category-tree.js";
import { requireCategory } from "./category-support.js";

export class MoveCategoryCommand {
  constructor(
    readonly id: string,
    /** `null` = remonter à la racine. */
    readonly parentId: string | null,
  ) {}
}

/**
 * `MoveCategory` — le verbe qui manquait à l'arbre.
 *
 * `wouldCreateCycle` existait, testé, mais n'était appelé par personne :
 * l'invariant 5 (« arbre sans cycle ») n'était donc gardé par rien, faute de
 * verbe capable de le violer. Il l'est maintenant.
 *
 * La famille déplacée arrive **en dernier** chez son nouveau parent : c'est le
 * seul rang qui ne bouscule aucune fratrie, et `ReorderCategories` sert à
 * choisir la place.
 */
@CommandHandler(MoveCategoryCommand)
export class MoveCategoryHandler implements ICommandHandler<MoveCategoryCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MoveCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);

    if (command.parentId !== null) {
      const parent = await requireCategory(this.categories, command.parentId);
      if (parent.isArchived) {
        throw new CategoryArchivedParentError(command.parentId);
      }
      const tree = await this.categories.listAll();
      assertNoCycle(tree, command.id, command.parentId);
    }

    const from = category.parentId;
    category.moveUnder(command.parentId, await this.categories.nextPosition(command.parentId));
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.categoryMoved,
        subjectType: "category",
        subjectId: category.id,
        // Le parent AVANT et APRÈS : c'est de lui que la famille tient sa TVA
        // et ses canaux, donc c'est lui qu'on vient chercher quand un tarif a
        // changé sans que personne n'ait touché au tarif.
        payload: { parentId: { from, to: command.parentId } },
      });
      await this.categories.save(category, ticket);
    });
  }
}
