import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LocationInUseError } from "../domain/errors/locations-errors.js";
import { LocationRepository } from "../domain/ports/location.repository.js";
import { LocationUsageReader } from "../domain/ports/location-usage.reader.js";
import { requireLocation } from "./location-support.js";

export class DeleteLocationCommand {
  constructor(readonly id: string) {}
}

/**
 * Supprime un emplacement — **sauf** si des familles le cochent encore.
 *
 * Les canaux d'une gamme référencent l'emplacement par son identifiant, dans
 * une colonne `jsonb` : aucune clé étrangère ne peut tenir cette référence, et
 * supprimer sous elle laisserait des grilles pointant un point de vente
 * disparu. Le refus est donc explicite, ici, et il DIT combien de familles
 * bloquent — sans quoi on cherche laquelle à la main.
 */
@CommandHandler(DeleteLocationCommand)
export class DeleteLocationHandler implements ICommandHandler<DeleteLocationCommand, void> {
  constructor(
    private readonly locations: LocationRepository,
    private readonly usage: LocationUsageReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeleteLocationCommand): Promise<void> {
    const location = await requireLocation(this.locations, command.id);
    const categories = await this.usage.countCategoriesUsing(command.id);
    if (categories > 0) {
      throw new LocationInUseError(command.id, categories);
    }
    const { name, tables } = location.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.locationDeleted,
        subjectType: "location",
        subjectId: command.id,
        // La seule suppression PHYSIQUE du référentiel : après elle, la ligne
        // n'est plus interrogeable, et le journal est le seul endroit où
        // l'emplacement a encore un nom.
        payload: { name, tableCount: tables.length },
      });
      await this.locations.remove(command.id, ticket);
    });
  }
}
