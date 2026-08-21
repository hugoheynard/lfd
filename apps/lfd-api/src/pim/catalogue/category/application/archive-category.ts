import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryHasActiveProductsError } from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class ArchiveCategoryCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(ArchiveCategoryCommand)
export class ArchiveCategoryHandler implements ICommandHandler<ArchiveCategoryCommand, void> {
  constructor(private readonly categories: CategoryRepository) {}

  /**
   * Invariant 5 : archiver une famille qui porte des produits actifs est
   * refusé. Le compte se lit hors de l'agrégat — une famille ne voit pas les
   * fiches qui la référencent.
   */
  async execute(command: ArchiveCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    if ((await this.categories.countActiveProducts(command.id)) > 0) {
      throw new CategoryHasActiveProductsError(command.id);
    }
    category.archive();
    await this.categories.save(category);
  }
}
