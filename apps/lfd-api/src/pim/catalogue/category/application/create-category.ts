import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { localizedText } from "../../shared/domain/value-objects/localized-text.js";
import { requireCategory } from "./category-support.js";

export interface CreateCategoryPayload {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly parentId?: string | undefined;
}

export class CreateCategoryCommand {
  constructor(readonly payload: CreateCategoryPayload) {}
}

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<CreateCategoryCommand, string> {
  constructor(
    private readonly categories: CategoryRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
  ) {}

  /** Le parent doit exister — c'est la seule règle que l'agrégat ne voit pas. */
  async execute(command: CreateCategoryCommand): Promise<string> {
    const { payload } = command;
    const parentId = payload.parentId ?? null;
    if (parentId !== null) {
      await requireCategory(this.categories, parentId);
    }

    const category = Category.open({
      id: this.ids.next(),
      name: localizedText("nom", payload.nameFr, payload.nameEn),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });
    await this.categories.add(category);
    return category.id;
  }
}
