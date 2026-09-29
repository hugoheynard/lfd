import {
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  DeliveryOrdersReader,
} from "../../../channels/commerce/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  DeliveryRoundStaleError,
  type LiveStopHolder,
} from "../../../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../../../domain/ports/delivery-round.repository.js";

/**
 * Des tournées en mémoire, stockées par leur instantané comme en base : la
 * version lue est exigée à l'écriture, exactement comme l'adaptateur.
 */
export class InMemoryDeliveryRounds extends DeliveryRoundRepository {
  readonly saved: string[] = [];
  readonly moves: (readonly [string, string])[] = [];
  private readonly byId = new Map<string, DeliveryRound>();

  constructor(...rounds: readonly DeliveryRound[]) {
    super();
    for (const round of rounds) {
      this.byId.set(round.id, copy(round));
    }
  }

  load(id: string): Promise<DeliveryRound | null> {
    const found = this.byId.get(id);
    return Promise.resolve(found === undefined ? null : copy(found));
  }

  save(round: DeliveryRound): Promise<void> {
    this.write(round);
    this.saved.push(round.id);
    return Promise.resolve();
  }

  saveMove(from: DeliveryRound, to: DeliveryRound): Promise<void> {
    this.write(from);
    this.write(to);
    this.moves.push([from.id, to.id]);
    return Promise.resolve();
  }

  nextPassage(serviceDay: string, vehicleId: string): Promise<number> {
    const passages = [...this.byId.values()]
      .filter((round) => round.serviceDay === serviceDay && round.vehicleId === vehicleId)
      .map((round) => round.passage);
    return Promise.resolve(Math.max(0, ...passages) + 1);
  }

  liveHolderOf(orderId: string): Promise<LiveStopHolder | null> {
    const holder = [...this.byId.values()].find((round) => round.orderIds.includes(orderId));
    return Promise.resolve(
      holder === undefined
        ? null
        : {
            vehicleName: holder.vehicleName,
            serviceDay: holder.serviceDay,
            passage: holder.passage,
          },
    );
  }

  /** La tournée telle qu'elle est « en base ». */
  stored(id: string): DeliveryRound | undefined {
    return this.byId.get(id);
  }

  private write(round: DeliveryRound): void {
    const current = this.byId.get(round.id);
    if (current !== undefined && current.version !== round.loadedVersion) {
      throw new DeliveryRoundStaleError(round.vehicleName);
    }
    this.byId.set(round.id, copy(round));
  }
}

/** Une copie qui repart « lue » : la version stockée devient la version lue. */
function copy(round: DeliveryRound): DeliveryRound {
  return DeliveryRound.restore(round.toSnapshot());
}

/** Le commerce, figé : des commandes connues par leur id. */
export class FixedDeliveryOrders extends DeliveryOrdersReader {
  constructor(private readonly orders: readonly DeliveryOrderFacts[] = []) {
    super();
  }

  expectedOn(day: string): Promise<readonly DeliveryOrderRef[]> {
    return Promise.resolve(
      this.orders
        .filter((order) => order.day === day && order.delivery)
        .map(({ orderId, reference, status }) => ({ orderId, reference, status })),
    );
  }

  byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]> {
    return Promise.resolve(this.orders.filter((order) => orderIds.includes(order.orderId)));
  }
}

/** Une livraison attendue ce jour-là, active. */
export function deliveryOn(
  orderId: string,
  day: string,
  overrides: Partial<DeliveryOrderFacts> = {},
): DeliveryOrderFacts {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    status: "active",
    day,
    delivery: true,
    ...overrides,
  };
}

/** Une tournée « lue », à sa version 1, avec ces commandes. */
export function roundWith(
  id: string,
  serviceDay: string,
  vehicleId: string,
  orderIds: readonly string[],
  passage = 1,
): DeliveryRound {
  return DeliveryRound.restore({
    id,
    serviceDay,
    vehicleId,
    vehicleName: `Véhicule ${vehicleId}`,
    passage,
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stops: orderIds.map((orderId, index) => ({
      id: `${id}_s${String(index + 1)}`,
      orderId,
      position: index + 1,
      closedAt: null,
    })),
  });
}
