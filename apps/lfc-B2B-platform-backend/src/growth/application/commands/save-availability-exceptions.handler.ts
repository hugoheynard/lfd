import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { AvailabilityConfigView } from "@lfd/contracts";

import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { SaveAvailabilityExceptionsCommand } from "./save-availability-exceptions.command.js";

/**
 * Écrit les exceptions seules. Rend la configuration **complète** relue en base :
 * l'écran affiche ce qui est réellement enregistré, et voit du même coup que sa
 * grille et ses règles n'ont pas bougé.
 */
@CommandHandler(SaveAvailabilityExceptionsCommand)
export class SaveAvailabilityExceptionsHandler implements ICommandHandler<
  SaveAvailabilityExceptionsCommand,
  AvailabilityConfigView
> {
  constructor(private readonly availability: AvailabilityStore) {}

  async execute(command: SaveAvailabilityExceptionsCommand): Promise<AvailabilityConfigView> {
    return this.availability.saveExceptions(command.exceptions);
  }
}
