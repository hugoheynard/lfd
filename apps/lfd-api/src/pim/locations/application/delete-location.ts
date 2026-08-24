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
  ) {}

  async execute(command: DeleteLocationCommand): Promise<void> {
    await requireLocation(this.locations, command.id);
    const categories = await this.usage.countCategoriesUsing(command.id);
    if (categories > 0) {
      throw new LocationInUseError(command.id, categories);
    }
    await this.locations.remove(command.id);
  }
}
