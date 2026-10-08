import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderDeliveryVatModeSetEvent } from "../domain/order-delivery-vat.events.js";
import { OrderDeliveryVatRepository } from "../domain/order-delivery-vat.repository.js";
import { DEFAULT_DELIVERY_VAT_MODE } from "../domain/order-delivery-vat.defaults.js";
import { SaveOrderDeliveryVatCommand } from "./save-order-delivery-vat.command.js";

/**
 * **Pose** le mode de TVA de la livraison. L'auteur vient de la requête,
 * jamais du corps.
 *
 * Journalisé dans la transaction de l'écriture, avec le mode d'avant — celui
 * qui S'APPLIQUAIT, repli compris. Reposer le mode qui s'applique déjà n'est
 * pas un fait (même règle que la surtaxe) : rien de ce qui est facturé ne
 * bouge. La ligne est quand même écrite — la première pose explicite de
 * `standard` transforme un repli en décision, ce que l'écran dit.
 */
@CommandHandler(SaveOrderDeliveryVatCommand)
export class SaveOrderDeliveryVatHandler implements ICommandHandler<
  SaveOrderDeliveryVatCommand,
  void
> {
  constructor(
    private readonly settings: OrderDeliveryVatRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveOrderDeliveryVatCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = (await this.settings.read()) ?? DEFAULT_DELIVERY_VAT_MODE;
      await this.settings.save(command.mode, command.updatedBy);
      if (before !== command.mode) {
        await this.events.publishTraced(new OrderDeliveryVatModeSetEvent(before, command.mode));
      }
    });
  }
}
