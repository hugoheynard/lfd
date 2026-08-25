import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  CategoryHasActiveChildrenError,
  CategoryHasActiveProductsError,
} from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { ProductCountReader } from "../domain/ports/product-count.reader.js";
import { requireCategory } from "./category-support.js";

export class ArchiveCategoryCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(ArchiveCategoryCommand)
export class ArchiveCategoryHandler implements ICommandHandler<ArchiveCategoryCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly products: ProductCountReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Deux refus, deux relations qu'une famille ne voit pas depuis elle-même.
   *
   * Les **fiches** (invariant 5) : archiver sous des produits actifs les
   * rendrait invendables sans que rien ne le dise.
   *
   * Les **sous-familles** : `MoveCategory` refuse de RANGER une famille sous
   * une archivée ; sans le refus symétrique ici, il suffisait d'archiver le
   * parent pour obtenir exactement l'état qu'il interdit — des familles
   * vivantes sous un parent mort, absentes du choix de parent et pointant un
   * nom qu'on ne trouve plus dans la liste.
   */
  async execute(command: ArchiveCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);

    if ((await this.products.countForCategory(command.id)) > 0) {
      throw new CategoryHasActiveProductsError(command.id);
    }
    const children = await this.categories.countActiveChildren(command.id);
    if (children > 0) {
      throw new CategoryHasActiveChildrenError(command.id, children);
    }

    category.archive();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productCategoryArchived,
        subjectType: "product_category",
        subjectId: category.id,
        // Le nom part avec le fait : une famille archivée disparaît des
        // écrans, et l'historique resterait illisible s'il ne portait qu'un id.
        payload: { name: category.name },
      });
      await this.categories.save(category, ticket);
    });
  }
}
