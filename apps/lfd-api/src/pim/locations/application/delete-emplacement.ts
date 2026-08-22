import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmplacementInUseError } from "../domain/errors/locations-errors.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { EmplacementUsageReader } from "../domain/ports/emplacement-usage.reader.js";
import { requireEmplacement } from "./emplacement-support.js";

export class DeleteEmplacementCommand {
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
@CommandHandler(DeleteEmplacementCommand)
export class DeleteEmplacementHandler implements ICommandHandler<DeleteEmplacementCommand, void> {
  constructor(
    private readonly emplacements: EmplacementRepository,
    private readonly usage: EmplacementUsageReader,
  ) {}

  async execute(command: DeleteEmplacementCommand): Promise<void> {
    await requireEmplacement(this.emplacements, command.id);
    const categories = await this.usage.countCategoriesUsing(command.id);
    if (categories > 0) {
      throw new EmplacementInUseError(command.id, categories);
    }
    await this.emplacements.remove(command.id);
  }
}
