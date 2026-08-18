import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { AvailabilityConfigView } from "@lfd/contracts";

import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { SaveAvailabilityCommand } from "./save-availability.command.js";

/**
 * Enregistre la disponibilité **en bloc**. Rend la configuration relue en base :
 * l'écran affiche ce qui est réellement enregistré, jamais ce qu'il croit avoir
 * envoyé.
 */
@CommandHandler(SaveAvailabilityCommand)
export class SaveAvailabilityHandler implements ICommandHandler<
  SaveAvailabilityCommand,
  AvailabilityConfigView
> {
  constructor(private readonly availability: AvailabilityStore) {}

  async execute(command: SaveAvailabilityCommand): Promise<AvailabilityConfigView> {
    return this.availability.replace(command.payload);
  }
}
