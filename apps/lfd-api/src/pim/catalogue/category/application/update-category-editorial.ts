import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import {
  CategoryEditorialReader,
  type CategoryEditorialView,
} from "../domain/ports/category-editorial-reader.js";
import { CategoryEditorialRepository } from "../domain/ports/category-editorial.repository.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  categoryEditorial,
  type CategoryEditorial,
  type CategoryEditorialInput,
} from "../domain/value-objects/category-editorial.js";
import { requireCategory } from "./category-support.js";

export class UpdateCategoryEditorialCommand {
  constructor(
    readonly id: string,
    readonly input: CategoryEditorialInput,
  ) {}
}

/**
 * Met à jour les TEXTES d'une famille. Les visuels suivent leur propre cycle et
 * ne sont pas touchés ici — deux sections d'écran, deux verbes.
 */
@CommandHandler(UpdateCategoryEditorialCommand)
export class UpdateCategoryEditorialHandler implements ICommandHandler<
  UpdateCategoryEditorialCommand,
  void
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly editorials: CategoryEditorialRepository,
    private readonly readers: CategoryEditorialReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateCategoryEditorialCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    // Une lecture de plus, assumée : les textes ne sont pas portés par
    // l'agrégat déjà chargé. Sans elle, la trace dirait « Communication
    // enregistrée » sans dire quoi — exactement le grain qu'on veut.
    const before = await this.readers.findByCategory(command.id);
    const after = categoryEditorial(command.input);
    const changes = changesBetween(flatten(before), flatten(after));

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productCategoryEditorialSaved,
              subjectType: "product_category",
              subjectId: command.id,
              payload: { changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.editorials.saveTexts(command.id, after, ticket);
    });
  }
}

/**
 * Les deux formes d'une même absence — `null` côté lecture, `undefined` côté
 * value-object — ramenées à `null`. Les laisser diverger ferait de chaque
 * premier enregistrement un faux changement sur les quatre champs.
 */
function flatten(
  source: CategoryEditorial | CategoryEditorialView | null,
): Record<string, unknown> {
  return {
    descriptionShort: source?.descriptionShort ?? null,
    descriptionLong: source?.descriptionLong ?? null,
    seoTitle: source?.seoTitle ?? null,
    seoDescription: source?.seoDescription ?? null,
  };
}
