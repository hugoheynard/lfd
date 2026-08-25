import { PimJournal } from "../../../journal/pim-journal.js";
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
import { requireCategory, requireFreeSlug } from "./category-support.js";

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
      name: localizedText("nom", payload.name),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });
    await requireFreeSlug(this.categories, category);
    // Dette déclarée (cf. `lint:journal-tracked`) : ce geste n'a pas encore
    // d'événement métier. Le motif est ici, greppable, plutôt que dans un
    // silence qu'on prendrait pour une décision.
    await this.categories.add(
      category,
      this.journal.untraced(
        "création de famille — aucun événement métier défini (dette journal-tracked)",
      ),
    );
    return category.id;
  }
}
