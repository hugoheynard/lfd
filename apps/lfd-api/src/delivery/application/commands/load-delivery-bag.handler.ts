import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { BagOrderNotComposedError } from "../../domain/errors/delivery-loading-errors.js";
import { DeliveryBagLoadedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBagRepository } from "../../domain/ports/delivery-bag.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { referencesOf } from "../delivery-round-support.js";
import { citedOrderOf, resolveBag } from "../delivery-loading-support.js";
import { LoadDeliveryBagCommand } from "./load-delivery-bag.command.js";

/**
 * **Charge un sac** dans une tournée (lot 4, L4-C2, L4-C18), par son QR ou son
 * code tapé.
 *
 * Le sac est cherché dans la tournée vivante de sa commande, tous jours
 * confondus (I3) : dans aucune → « à répartir d'abord » ; dans une AUTRE →
 * refus qui nomme le véhicule et le jour. Le chargement appartient à l'arrêt ;
 * charger deux fois le même sac n'écrit rien la seconde fois.
 *
 * @throws {DeliveryBagNotFoundError} @throws {InvalidBagCodeError}
 * @throws {BagOrderNotComposedError} @throws {BagInOtherRoundError}
 * @throws {BagVoidedError} @throws {DeliveryRoundDepartedError}
 * @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(LoadDeliveryBagCommand)
export class LoadDeliveryBagHandler implements ICommandHandler<LoadDeliveryBagCommand, void> {
  constructor(
    private readonly bags: DeliveryBagRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: LoadDeliveryBagCommand): Promise<void> {
    await this.uow.run(async () => {
      const { bag, via } = await resolveBag(this.bags, command.payload);
      const loading = await this.loadings.forOrder(bag.orderId, bag.id);
      if (loading === null) {
        const references = await referencesOf(this.orders, [bag.orderId]);
        throw new BagOrderNotComposedError(bag.code, references.get(bag.orderId) ?? bag.orderId);
      }
      const loaded = loading.load({
        roundId: command.roundId,
        bagId: bag.id,
        loadId: this.ids.next(),
        via,
        by: command.staffUserId,
        at: this.clock.now(),
      });
      if (!loaded || !(await this.loadings.save(loading))) {
        return;
      }
      await this.events.publishTraced(
        new DeliveryBagLoadedEvent(bag, await citedOrderOf(this.orders, bag.orderId), loading, via),
      );
    });
  }
}
