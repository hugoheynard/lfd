import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateAllergenEntryPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenEntry } from "../domain/entities/allergen-entry.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";
import { ensureCodeFree, requireLivingCategory } from "./allergen-support.js";

export class CreateAllergenEntryCommand {
  constructor(readonly payload: CreateAllergenEntryPayload) {}
}

/**
 * Déclare un allergène **maison**.
 *
 * Deux gardes que l'agrégat ne peut pas voir : que la catégorie d'accueil
 * existe et soit encore au référentiel, et qu'aucune autre entrée ne porte ce
 * code. La seconde se rejoue en base (index unique) — entre le regard et
 * l'écriture, deux onglets peuvent saisir le même code.
 *
 * `official` n'est pas un paramètre : les 30 codes GS1 naissent d'une migration
 * semée, et une entrée créée à l'écran ne peut pas se hisser au rang de code
 * réglementaire.
 */
@CommandHandler(CreateAllergenEntryCommand)
export class CreateAllergenEntryHandler implements ICommandHandler<
  CreateAllergenEntryCommand,
  string
> {
  constructor(
    private readonly entries: AllergenEntryRepository,
    private readonly categories: AllergenCategoryRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateAllergenEntryCommand): Promise<string> {
    const { payload } = command;
    const category = await requireLivingCategory(this.categories, payload.categoryId);
    // L'agrégat nettoie le code ; c'est donc la version nettoyée qu'on
    // confronte au référentiel, pas celle reçue.
    const entry = AllergenEntry.declare({
      id: this.ids.next(),
      code: payload.code,
      name: payload.name,
      categoryId: category.id,
    });
    await ensureCodeFree(this.entries, entry.code);

    const created = entry.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenEntryCreated,
        subjectType: "allergen_entry",
        subjectId: created.id,
        payload: { code: created.code, name: created.name, category: category.key },
      });
      await this.entries.add(entry, ticket);
    });
    return created.id;
  }
}
