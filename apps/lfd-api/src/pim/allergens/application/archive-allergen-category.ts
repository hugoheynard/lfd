import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCatalogueReader } from "../domain/ports/allergen-catalogue.reader.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { ensureCategoryUncited, requireCategory } from "./allergen-support.js";

export class ArchiveAllergenCategoryCommand {
  constructor(readonly id: string) {}
}

/**
 * Retire une catégorie maison du référentiel **sans l'effacer**.
 *
 * Deux refus, à deux endroits, et ils ne disent pas la même chose :
 *
 * - l'agrégat refuse une catégorie **officielle** — archiver du droit, c'est le
 *   supprimer ;
 * - le handler refuse une catégorie qui accueille encore des allergènes
 *   **proposés**. La FK `Restrict` ne protège que de l'effacement : rien en base
 *   n'empêcherait d'archiver la famille sous ses entrées, qui resteraient
 *   offertes à la saisie sans famille visible.
 *
 * L'instant vient du `Clock` : le domaine reste déterministe, et deux archivages
 * dans la même requête portent le même instant.
 */
@CommandHandler(ArchiveAllergenCategoryCommand)
export class ArchiveAllergenCategoryHandler implements ICommandHandler<
  ArchiveAllergenCategoryCommand,
  void
> {
  constructor(
    private readonly categories: AllergenCategoryRepository,
    private readonly catalogue: AllergenCatalogueReader,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveAllergenCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    await ensureCategoryUncited(this.catalogue, category);
    category.archive(this.clock.now());
    const archived = category.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenCategoryArchived,
        subjectType: "allergen_category",
        subjectId: archived.id,
        // La clé et le libellé voyagent avec le fait : une catégorie archivée
        // sort des écrans, et l'historique ne doit pas se réduire à un
        // identifiant qu'on ne peut plus résoudre nulle part.
        payload: { key: archived.key, name: archived.name },
      });
      await this.categories.save(category, ticket);
    });
  }
}
