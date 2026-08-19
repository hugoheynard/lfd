import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryRepository } from "../domain/ports/category.repository.js";
import { localizedText } from "../domain/value-objects/localized-text.js";
import { requireCategory, slugOf } from "./category-support.js";

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

@CommandHandler(RenameCategoryCommand)
export class RenameCategoryHandler implements ICommandHandler<RenameCategoryCommand, void> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: RenameCategoryCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    const name = localizedText("nom", command.payload.nameFr, command.payload.nameEn);
    await this.categories.rename(command.id, name, slugOf(name));
  }
}
