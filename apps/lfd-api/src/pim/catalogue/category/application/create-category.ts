import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { CategoryArchivedParentError } from "../domain/errors/category-errors.js";
import { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { assertSlugFree, requireCategory } from "./category-support.js";

export interface CreateCategoryPayload {
  /** Le nom, dans les langues renseignées — la source est obligatoire. Une
   *  CARTE et non `nameFr` + `nameEn` : ouvrir une langue ne doit pas ajouter un
   *  champ ici, ni chez les quatre autres commandes qui portaient les mêmes. */
  readonly name: LocalizedText;
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
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
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

    const parent = parentId === null ? null : await requireCategory(this.categories, parentId);
    if (parent?.isArchived === true) {
      throw new CategoryArchivedParentError(parent.id);
    }

    const category = Category.open({
      id: this.ids.next(),
      name: localizedText("nom", payload.name),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });
    await assertSlugFree(this.categories, category);

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productCategoryCreated,
        subjectType: "product_category",
        subjectId: category.id,
        // Le parent NOMMÉ : une famille renommée depuis se lit sous le nom
        // qu'elle portait ce jour-là (D5 du plan des phrases du journal).
        payload: {
          subjectLabel: category.name.fr,
          name: category.name,
          parent: parent === null ? null : { id: parent.id, name: parent.name.fr },
        },
      });
      await this.categories.add(category, ticket);
    });
    return category.id;
  }
}
