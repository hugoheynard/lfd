import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRegime } from "../../../commerce/application/tva-support.js";
import { TvaRegimeRepository } from "../../../commerce/domain/ports/tva-regime.repository.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryTvaCommand {
  constructor(
    readonly id: string,
    readonly emporterTvaId: string | null,
    readonly surPlaceTvaId: string | null,
  ) {}
}

/**
 * Règle les deux régimes de TVA d'une famille en un geste. Chaque référence
 * non nulle est **validée** contre le contexte commerce (`requireRegime`) : on
 * ne pointe jamais un régime fantôme. `null` efface la référence.
 */
@CommandHandler(SetCategoryTvaCommand)
export class SetCategoryTvaHandler implements ICommandHandler<SetCategoryTvaCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly regimes: TvaRegimeRepository,
  ) {}

  async execute(command: SetCategoryTvaCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    if (command.emporterTvaId !== null) {
      await requireRegime(this.regimes, command.emporterTvaId);
    }
    if (command.surPlaceTvaId !== null) {
      await requireRegime(this.regimes, command.surPlaceTvaId);
    }
    await this.categories.setTva(command.id, command.emporterTvaId, command.surPlaceTvaId);
  }
}
