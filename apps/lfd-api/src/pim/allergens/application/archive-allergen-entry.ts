import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";
import { requireEntry } from "./allergen-support.js";

export class ArchiveAllergenEntryCommand {
  constructor(readonly id: string) {}
}

/**
 * Retire un allergène maison de ce qu'on **propose**, jamais de ce qu'on
 * **reconnaît** (D2 bis).
 *
 * Les déclarations qui le citent restent valides et relisibles : invalider
 * l'étiquette d'un produit déjà servi n'est pas ce que le staff décide en
 * archivant une ligne. C'est le catalogue de saisie qui cesse de l'offrir ;
 * `knownCodes()` continue de le connaître.
 *
 * Le refus sur une entrée officielle vient de l'agrégat — ici, l'archivage EST
 * la suppression, et la suppression d'un code GS1 est interdite.
 */
@CommandHandler(ArchiveAllergenEntryCommand)
export class ArchiveAllergenEntryHandler implements ICommandHandler<
  ArchiveAllergenEntryCommand,
  void
> {
  constructor(
    private readonly entries: AllergenEntryRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveAllergenEntryCommand): Promise<void> {
    const entry = await requireEntry(this.entries, command.id);
    entry.archive(this.clock.now());
    const archived = entry.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.allergenEntryArchived,
        subjectType: "allergen_entry",
        subjectId: archived.id,
        // Le code et le libellé voyagent avec le fait : une entrée archivée sort
        // des écrans, et l'historique ne doit pas se réduire à un identifiant
        // qu'on ne peut plus résoudre nulle part.
        payload: { code: archived.code, name: archived.name },
      });
      await this.entries.save(entry, ticket);
    });
  }
}
