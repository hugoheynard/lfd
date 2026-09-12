import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderHandedOverEvent } from "../../../../handover/channels/commerce/index.js";
import { MarkOrderFulfilledCommand } from "../commands/mark-order-fulfilled.command.js";

/**
 * **Le commerce apprend qu'une commande a été remise**, et ferme la sienne.
 *
 * Même figure que `OnOrderPacked`, et pour la même raison : ce qui change n'est
 * pas ce que le commerce fait, c'est **qui le déclenche**. Le fournil, par un
 * fait — et non plus une route `/admin/handover` hébergée ici, sur un geste que
 * le commerce ne voit pas.
 *
 * ⚠️ Le nom de l'événement écouté est celui de la **production**
 * (`handover/channels/commerce`), pas celui que le commerce republie ensuite.
 * Les deux s'appellent pareil parce qu'il n'y a rien à distinguer entre « remise
 * constatée » et « commande remise » — le jour où il y aurait quelque chose, ce
 * sera le signe qu'ils doivent se séparer.
 *
 * `BackgroundWork.track` est obligatoire (`lint:events-tracked`) : un `void`
 * promesse mourrait en silence.
 */
@EventsHandler(OrderHandedOverEvent)
export class OnOrderHandedOver implements IEventHandler<OrderHandedOverEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderHandedOverEvent): void {
    void this.work.track(this.run(event), "on-order-handed-over");
  }

  private async run(event: OrderHandedOverEvent): Promise<void> {
    await this.commands.execute(
      new MarkOrderFulfilledCommand(
        event.reference,
        event.handedOverBy,
        event.handedOverAt,
        event.via,
      ),
    );
  }
}
