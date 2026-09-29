import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { BinOrderNotComposedError } from "../../domain/errors/delivery-loading-errors.js";
import { DeliveryBinLoadedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { referencesOf } from "../delivery-round-support.js";
import { citedOrderOf, resolveBin } from "../delivery-loading-support.js";
import { LoadDeliveryBinCommand } from "./load-delivery-bin.command.js";

/**
 * **Charge un bac** dans une tournée (lot 4, L4-C2, L4-C18), par son QR ou son
 * code tapé.
 *
 * Le bac est cherché dans la tournée vivante de sa commande, tous jours
 * confondus (I3) : dans aucune → « à répartir d'abord » ; dans une AUTRE →
 * refus qui nomme le véhicule et le jour. Le chargement appartient à l'arrêt ;
 * charger deux fois le même bac n'écrit rien la seconde fois.
 *
 * @throws {DeliveryBinNotFoundError} @throws {InvalidBinCodeError}
 * @throws {BinOrderNotComposedError} @throws {BinInOtherRoundError}
 * @throws {BinVoidedError} @throws {DeliveryRoundDepartedError}
 * @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(LoadDeliveryBinCommand)
export class LoadDeliveryBinHandler implements ICommandHandler<LoadDeliveryBinCommand, void> {
  constructor(
    private readonly bins: DeliveryBinRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: LoadDeliveryBinCommand): Promise<void> {
    await this.uow.run(async () => {
      const { bin, via } = await resolveBin(this.bins, command.payload);
      const loading = await this.loadings.forOrder(bin.orderId, bin.id);
      if (loading === null) {
        const references = await referencesOf(this.orders, [bin.orderId]);
        throw new BinOrderNotComposedError(bin.code, references.get(bin.orderId) ?? bin.orderId);
      }
      const loaded = loading.load({
        roundId: command.roundId,
        binId: bin.id,
        loadId: this.ids.next(),
        via,
        by: command.staffUserId,
        at: this.clock.now(),
      });
      if (!loaded || !(await this.loadings.save(loading))) {
        return;
      }
      await this.events.publishTraced(
        new DeliveryBinLoadedEvent(bin, await citedOrderOf(this.orders, bin.orderId), loading, via),
      );
    });
  }
}
