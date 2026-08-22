import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryRepository } from "../domain/ports/category.repository.js";
import { localizedText } from "../../shared/domain/value-objects/localized-text.js";
import { requireCategory, requireFreeSlug } from "./category-support.js";

export interface RenameCategoryPayload {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
}

export class RenameCategoryCommand {
  constructor(
    readonly id: string,
    readonly payload: RenameCategoryPayload,
  ) {}
}

/** Le slug suit le nom : c'est l'agrégat qui le re-dérive, plus l'appelant. */
@CommandHandler(RenameCategoryCommand)
export class RenameCategoryHandler implements ICommandHandler<RenameCategoryCommand, void> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: RenameCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    category.rename(localizedText("nom", command.payload.nameFr, command.payload.nameEn));
    await requireFreeSlug(this.categories, category);
    await this.categories.save(category);
  }
}
