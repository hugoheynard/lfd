import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { assertCompleteOrder } from "../domain/services/category-tree.js";

/** L'identifiant conventionnel du premier niveau, qui n'a pas de famille parente. */
const ROOT_LEVEL = "root";

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
    private readonly uow: UnitOfWork,
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
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productCategoriesReordered,
        subjectType: "product_category",
        // Le sujet est le NIVEAU réordonné, pas chacune des sœurs : c'est un
        // seul geste. La racine n'a pas d'id — elle en reçoit un, faute de
        // quoi tous les réordonnancements de premier niveau seraient orphelins
        // et introuvables à la lecture.
        subjectId: command.parentId ?? ROOT_LEVEL,
        payload: { order: command.orderedIds },
      });
      await this.categories.saveAll(ranked, ticket);
    });
  }
}
