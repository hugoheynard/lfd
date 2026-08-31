import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ReviseAllergenEntryPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";
import { requireEntry, requireLivingCategory } from "./allergen-support.js";

export class ReviseAllergenEntryCommand {
  constructor(
    readonly id: string,
    readonly payload: ReviseAllergenEntryPayload,
  ) {}
}

/**
 * Règle un allergène maison : son libellé, sa catégorie d'accueil.
 *
 * Le code n'y figure pas — c'est une identité de stockage, citée en clair par
 * les déclarations déjà enregistrées. Le refus sur une entrée officielle vient
 * de l'agrégat : c'est du droit.
 */
@CommandHandler(ReviseAllergenEntryCommand)
export class ReviseAllergenEntryHandler implements ICommandHandler<
  ReviseAllergenEntryCommand,
  void
> {
  constructor(
    private readonly entries: AllergenEntryRepository,
    private readonly categories: AllergenCategoryRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReviseAllergenEntryCommand): Promise<void> {
    const { payload } = command;
    const entry = await requireEntry(this.entries, command.id);
    if (payload.categoryId !== undefined) {
      // La catégorie visée doit exister ET être encore au référentiel : y
      // déplacer une entrée proposée la rendrait invisible à l'écran qui la
      // range par famille.
      await requireLivingCategory(this.categories, payload.categoryId);
    }
    const before = traced(entry.snapshot());
    entry.revise(payload);
    const after = entry.snapshot();
    const changes = changesBetween(before, traced(after));

    // L'écran renvoie la ligne entière à chaque enregistrement. Un formulaire
    // réenregistré à l'identique n'est pas un fait, et ce n'est pas non plus une
    // écriture : on ne repasse pas sur la ligne pour n'y rien changer, plutôt
    // que d'inventer une écriture sans trace.
    if (Object.keys(changes).length === 0) {
      return;
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenEntryUpdated,
        subjectType: "allergen_entry",
        subjectId: after.id,
        payload: { code: after.code, changes },
      });
      await this.entries.save(entry, ticket);
    });
  }
}

/** Ce que le journal retient. Le code n'y est pas : il identifie le sujet. */
function traced(snapshot: {
  readonly name: unknown;
  readonly categoryId: string;
}): Record<string, unknown> {
  return { name: snapshot.name, categoryId: snapshot.categoryId };
}
