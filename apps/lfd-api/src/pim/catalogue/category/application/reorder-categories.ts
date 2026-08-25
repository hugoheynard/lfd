import { PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { assertCompleteOrder } from "../domain/services/category-tree.js";

export class ReorderCategoriesCommand {
  constructor(
    /** Le niveau réordonné — `null` = la racine. */
    readonly parentId: string | null,
    readonly orderedIds: readonly string[],
  ) {}
}

/**
 * `ReorderCategories` — range une fratrie entière, jamais à moitié.
 *
 * Les familles **archivées sont hors du jeu** : elles ne sont ni exigées dans
 * l'ordre proposé, ni réécrites. C'est la même règle que partout ailleurs —
 * une famille archivée est gelée — et cela évite de demander à l'écran de
 * classer des familles qu'il ne montre pas.
 *
 * L'écriture est **transactionnelle** : une fratrie à moitié renumérotée
 * porterait des rangs en double, et l'affichage retomberait sur l'ordre
 * d'insertion.
 */
@CommandHandler(ReorderCategoriesCommand)
export class ReorderCategoriesHandler implements ICommandHandler<ReorderCategoriesCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: ReorderCategoriesCommand): Promise<void> {
    const living = (await this.categories.listChildren(command.parentId)).filter(
      (category) => !category.isArchived,
    );
    assertCompleteOrder(
      living.map((category) => category.id),
      command.orderedIds,
      command.parentId,
    );

    const byId = new Map(living.map((category) => [category.id, category]));
    const ranked: Category[] = [];
    command.orderedIds.forEach((id, rank) => {
      const category = byId.get(id);
      if (category !== undefined) {
        category.placeAt(rank);
        ranked.push(category);
      }
    });
    // Dette déclarée (cf. `lint:journal-tracked`) : ce geste n'a pas encore
    // d'événement métier. Le motif est ici, greppable, plutôt que dans un
    // silence qu'on prendrait pour une décision.
    await this.categories.saveAll(
      ranked,
      this.journal.untraced(
        "réordonnancement de familles — aucun événement métier défini (dette journal-tracked)",
      ),
    );
  }
}
