import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { changesBetween } from "../../../journal/changes.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { requireCategory } from "./category-support.js";

export interface RenameCategoryPayload {
  /** Le nom, dans les langues renseignées — la source est obligatoire. Une
   *  CARTE et non `nameFr` + `nameEn` : ouvrir une langue ne doit pas ajouter un
   *  champ ici, ni chez les quatre autres commandes qui portaient les mêmes. */
  readonly name: LocalizedText;
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
  constructor(
    private readonly categories: CategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenameCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    const before = category.name;
    category.rename(localizedText("nom", command.payload.name));
    const changes = changesBetween({ name: before }, { name: category.name });
    await this.uow.run(async () => {
      // Un renommage qui ne renomme rien n'est pas un fait : le geste existe
      // (l'écran a envoyé le formulaire), la décision non.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productCategoryRenamed,
              subjectType: "product_category",
              subjectId: category.id,
              payload: { changes },
            })
          : this.journal.untraced("famille enregistrée sans changement de nom");
      await this.categories.save(category, ticket);
    });
  }
}
