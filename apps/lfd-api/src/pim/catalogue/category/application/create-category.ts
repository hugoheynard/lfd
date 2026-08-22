import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { CategoryArchivedParentError } from "../domain/errors/category-errors.js";
import { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { localizedText } from "../../shared/domain/value-objects/localized-text.js";
import { requireCategory, requireFreeSlug } from "./category-support.js";

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

  /**
   * Le parent doit exister **et être vivant** — les deux règles que l'agrégat
   * ne voit pas depuis lui-même.
   *
   * `MoveCategory` refusait déjà un parent archivé ; la création, non. Le même
   * invariant était donc gardé sur deux chemins des trois, et le troisième
   * suffisait à le violer. Le front filtre les archivées de sa liste de
   * parents — c'est précisément pourquoi le trou serait passé inaperçu.
   */
  async execute(command: CreateCategoryCommand): Promise<string> {
    const { payload } = command;
    const parentId = payload.parentId ?? null;
    if (parentId !== null) {
      const parent = await requireCategory(this.categories, parentId);
      if (parent.isArchived) {
        throw new CategoryArchivedParentError(parentId);
      }
    }

    const category = Category.open({
      id: this.ids.next(),
      name: localizedText("nom", payload.nameFr, payload.nameEn),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });
    await requireFreeSlug(this.categories, category);
    await this.categories.add(category);
    return category.id;
  }
}
