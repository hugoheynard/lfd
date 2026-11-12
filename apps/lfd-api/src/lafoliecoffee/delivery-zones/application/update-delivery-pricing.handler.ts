import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../feature-access/application/feature-access-author.js";
import { PublicSettingsEdgeCache } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { DeliveryPricing } from "../domain/delivery-pricing.js";
import { DeliveryPricingUpdatedEvent } from "../domain/delivery-pricing.events.js";
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
 * Depuis 0b, le réglage pèse sur le frais de toute une clientèle : le fait
 * `delivery_pricing.updated` part tracé, dans la transaction, avec l'état
 * remplacé.
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
    private readonly events: DomainEventPublisher,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  async execute(command: UpdateDeliveryPricingCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const current = await this.reader.current();
      const previous = { b2b: current.b2b, b2c: current.b2c };
      const posed = DeliveryPricing.pose({
        current: previous,
        patch: command.patch,
        at: this.clock.now(),
        author,
      });
      // Rejouer le geste (ou redire l'état courant) ne change rien : ni
      // écriture, ni fait au journal, ni purge des réglages publics.
      if (!posed.changes(previous)) {
        return;
      }
      await this.pricing.put(posed);
      await this.events.publishTraced(new DeliveryPricingUpdatedEvent(posed.terms, previous));
      this.afterCommit.defer(() => this.edge.purge(), "delivery-pricing.edge-purge");
    });
  }
}
