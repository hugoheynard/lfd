import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateAllergenCategoryPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategory } from "../domain/entities/allergen-category.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { ensureCategoryKeyFree } from "./allergen-support.js";

export class CreateAllergenCategoryCommand {
  constructor(readonly payload: CreateAllergenCategoryPayload) {}
}

/** Le rang par défaut d'une catégorie maison — derrière les 15 semées. */
const DEFAULT_POSITION = 100;

/**
 * Ouvre une catégorie **maison**.
 *
 * `official` et `incoCategory` ne sont pas des paramètres et ne peuvent pas
 * l'être : `AllergenCategory.declare()` n'en prend pas. L'annexe II ne s'étend
 * pas depuis le back-office — c'est un semis, pas une saisie — et l'absence de
 * champ le garantit mieux qu'une garde qu'on pourrait oublier.
 */
@CommandHandler(CreateAllergenCategoryCommand)
export class CreateAllergenCategoryHandler implements ICommandHandler<
  CreateAllergenCategoryCommand,
  string
> {
  constructor(
    private readonly categories: AllergenCategoryRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateAllergenCategoryCommand): Promise<string> {
    const { payload } = command;
    // L'agrégat naît d'abord : c'est LUI qui nettoie la clé, et c'est donc la
    // version nettoyée qu'on confronte aux autres. Chercher la collision avant
    // reviendrait à comparer une clé qui n'en est pas encore une.
    const category = AllergenCategory.declare({
      id: this.ids.next(),
      key: payload.key,
      name: payload.name,
      position: payload.position ?? DEFAULT_POSITION,
    });
    await ensureCategoryKeyFree(this.categories, category.key);

    const created = category.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenCategoryCreated,
        subjectType: "allergen_category",
        subjectId: created.id,
        payload: { key: created.key, name: created.name, position: created.position },
      });
      await this.categories.add(category, ticket);
    });
    return created.id;
  }
}
