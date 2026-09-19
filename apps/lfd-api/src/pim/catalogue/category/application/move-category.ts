import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryArchivedParentError } from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { assertNoCycle } from "../domain/services/category-tree.js";
import { namedCategory, requireCategory } from "./category-support.js";

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

    const parent =
      command.parentId === null ? null : await requireCategory(this.categories, command.parentId);
    if (parent !== null) {
      if (parent.isArchived) {
        throw new CategoryArchivedParentError(parent.id);
      }
      const tree = await this.categories.listAll();
      assertNoCycle(tree, command.id, parent.id);
    }

    // L'ancien parent, lu pour son NOM : la ligne doit dire d'où la famille
    // venait sous le nom qu'il portait ce jour-là.
    const from =
      category.parentId === null ? null : await requireCategory(this.categories, category.parentId);
    category.moveUnder(command.parentId, await this.categories.nextPosition(command.parentId));
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productCategoryMoved,
        subjectType: "product_category",
        subjectId: category.id,
        // Le parent AVANT et APRÈS : la place de la famille dans l'arbre. Elle
        // ne tient de lui ni sa TVA ni ses canaux — `effectiveVat` ne lit que
        // la famille directe d'une fiche, et les canaux se lisent sur son seul
        // `channelPreset` (vérifié le 2026-09-19 ; ce commentaire affirmait
        // l'inverse). Déplacer une famille ne change donc aucun taux.
        payload: {
          subjectLabel: category.name.fr,
          parent: { from: namedCategory(from), to: namedCategory(parent) },
        },
      });
      await this.categories.save(category, ticket);
    });
  }
}
