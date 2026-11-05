import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../feature-access/application/feature-access-author.js";
import { PublicSettingsEdgeCache } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { DeliveryPricing } from "../domain/delivery-pricing.js";
import { DeliveryPricingReader } from "../domain/ports/delivery-pricing.reader.js";
import { DeliveryPricingRepository } from "../domain/ports/delivery-pricing.repository.js";
import { UpdateDeliveryPricingCommand } from "./update-delivery-pricing.command.js";

/**
 * Pose le réglage global de livraison (plan `plan-livraison-offerte.md`,
 * sous-lot 0a). L'état remplacé est relu DANS la transaction : un patch ne
 * dit qu'une valeur, et les autres doivent être celles qui sont écrites, pas
 * celles qu'un écran a vues.
 *
 * Les réglages publics gardés par Workers Cache sont purgés **après** la
 * validation (`AfterCommit`) : une écriture refusée ne purge rien. Rien ne sert
 * encore ce réglage en public (0c), mais la route des zones le servira, et un
 * écrivain qui n'est pas inscrit à la purge le jour de sa naissance ne le sera
 * jamais.
 *
 * @sans-journal en 0a, aucun écran ne le pose et aucun calcul ne le lit ; la
 * ligne fige déjà qui et quand. Le fait `delivery_pricing.updated` vient avec
 * l'écran et la lecture du 0b, quand le réglage pèse sur un prix.
 */
@CommandHandler(UpdateDeliveryPricingCommand)
export class UpdateDeliveryPricingHandler implements ICommandHandler<
  UpdateDeliveryPricingCommand,
  void
> {
  constructor(
    private readonly reader: DeliveryPricingReader,
    private readonly pricing: DeliveryPricingRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  async execute(command: UpdateDeliveryPricingCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const current = await this.reader.current();
      await this.pricing.put(
        DeliveryPricing.pose({
          current: { b2b: current.b2b, b2c: current.b2c },
          patch: command.patch,
          at: this.clock.now(),
          author,
        }),
      );
      this.afterCommit.defer(() => this.edge.purge(), "delivery-pricing.edge-purge");
    });
  }
}
