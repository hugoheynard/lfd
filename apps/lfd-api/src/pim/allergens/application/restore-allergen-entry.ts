import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";
import { requireEntry, requireLivingCategory } from "./allergen-support.js";

export class RestoreAllergenEntryCommand {
  constructor(readonly id: string) {}
}

/**
 * Remet un allergène maison à ce qu'on propose.
 *
 * La catégorie d'accueil doit être **encore au référentiel** : une entrée
 * restaurée sous une famille archivée serait offerte à la saisie sans que
 * l'écran, qui range par catégorie, puisse la montrer. C'est la garde miroir de
 * celle de la création, et elle vaut ici parce que la famille a pu être
 * archivée entre-temps.
 */
@CommandHandler(RestoreAllergenEntryCommand)
export class RestoreAllergenEntryHandler implements ICommandHandler<
  RestoreAllergenEntryCommand,
  void
> {
  constructor(
    private readonly entries: AllergenEntryRepository,
    private readonly categories: AllergenCategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreAllergenEntryCommand): Promise<void> {
    const entry = await requireEntry(this.entries, command.id);
    await requireLivingCategory(this.categories, entry.categoryId);
    entry.restore();
    const restored = entry.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenEntryRestored,
        subjectType: "allergen_entry",
        subjectId: restored.id,
        payload: { code: restored.code, name: restored.name },
      });
      await this.entries.save(entry, ticket);
    });
  }
}
