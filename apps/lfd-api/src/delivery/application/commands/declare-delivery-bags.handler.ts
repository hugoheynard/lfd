import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { type DeliveryOrderFacts, DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBag } from "../../domain/entities/delivery-bag.js";
import {
  BagsNotDeclarableError,
  type UndeclarableReason,
} from "../../domain/errors/delivery-loading-errors.js";
import { DeliveryBagsDeclaredEvent } from "../../domain/events/delivery-loading.events.js";
import { BagCodeDrawer } from "../../domain/ports/bag-code-drawer.js";
import { DeliveryBagRepository } from "../../domain/ports/delivery-bag.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { drawBagCodes } from "../delivery-loading-support.js";
import { DeclareDeliveryBagsCommand } from "./declare-delivery-bags.command.js";

/**
 * **Déclare des sacs** pour une commande (lot 4, L4-C16) : un sac naît ici,
 * jamais à l'impression. Ajouter un sac plus tard, c'est en déclarer un de
 * plus. Chacun reçoit un code court tiré au sort, libre sur tous les sacs
 * (L4-C20). UN fait au journal pour la déclaration.
 *
 * La commande doit exister, être en livraison et non annulée — lue au
 * commerce au moment du geste. Si elle est déjà dans une tournée, celle-ci est
 * verrouillée en partage : une tournée partie ne reçoit plus de sac.
 *
 * @throws {BagsNotDeclarableError} @throws {DeliveryRoundDepartedError}
 * @throws {BagCodeExhaustedError} @throws {BagCodeCollisionError}
 */
@CommandHandler(DeclareDeliveryBagsCommand)
export class DeclareDeliveryBagsHandler implements ICommandHandler<
  DeclareDeliveryBagsCommand,
  readonly string[]
> {
  constructor(
    private readonly bags: DeliveryBagRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly drawer: BagCodeDrawer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareDeliveryBagsCommand): Promise<readonly string[]> {
    const { orderId, count } = command.payload;
    return this.uow.run(async () => {
      const reference = await this.declarableReference(orderId);
      const loading = await this.loadings.forOrder(orderId);
      const codes = await drawBagCodes(this.drawer, this.bags, count);
      const bags = DeliveryBag.declare({
        orderId,
        bags: codes.map((code) => ({ id: this.ids.next(), code })),
        at: this.clock.now(),
        loading,
      });
      await this.bags.declare(bags);
      await this.events.publishTraced(
        new DeliveryBagsDeclaredEvent({ id: orderId, name: reference }, bags),
      );
      return bags.map((bag) => bag.id);
    });
  }

  /** @throws {BagsNotDeclarableError} */
  private async declarableReference(orderId: string): Promise<string> {
    const [order] = await this.orders.byIds([orderId]);
    const reason = order === undefined ? "unknown" : undeclarableReason(order);
    if (order === undefined || reason !== null) {
      throw new BagsNotDeclarableError(order?.reference ?? orderId, reason ?? "unknown");
    }
    return order.reference;
  }
}

function undeclarableReason(order: DeliveryOrderFacts): UndeclarableReason | null {
  if (order.status === "cancelled") {
    return "cancelled";
  }
  return order.delivery ? null : "not_delivery";
}
