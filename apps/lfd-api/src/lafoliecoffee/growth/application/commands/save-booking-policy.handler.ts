import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { AvailabilityConfigView } from "@lfd/contracts";

import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { SaveBookingPolicyCommand } from "./save-booking-policy.command.js";

/**
 * Écrit la politique seule. Rend la configuration **complète** relue en base :
 * l'écran affiche ce qui est réellement enregistré, et voit du même coup que ses
 * règles n'ont pas bougé.
 */
@CommandHandler(SaveBookingPolicyCommand)
export class SaveBookingPolicyHandler implements ICommandHandler<
  SaveBookingPolicyCommand,
  AvailabilityConfigView
> {
  constructor(private readonly availability: AvailabilityStore) {}

  async execute(command: SaveBookingPolicyCommand): Promise<AvailabilityConfigView> {
    return this.availability.savePolicy(command.policy);
  }
}
