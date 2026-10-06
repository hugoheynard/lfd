import type { DepartureSheet } from "../../../domain/entities/departure-sheet.js";
import {
  DeliveryDayReadiness,
  type DeliveryDayReadinessState,
} from "../../../domain/entities/delivery-day-readiness.js";
import {
  DeliveryOrdersReader,
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  type DeliveryStopPoint,
} from "../../../channels/commerce/index.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../../../domain/ports/composition-prerequisites.readers.js";
import { DeliveryDayReadinessRepository } from "../../../domain/ports/delivery-day-readiness.repository.js";

/** Le commerce, tel que la composition le lit : seul `byIds` sert ici. */
export class FixedDeliveryOrders extends DeliveryOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly facts: readonly DeliveryOrderFacts[]) {
    super();
  }

  byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]> {
    this.asked.push(orderIds);
    return Promise.resolve(this.facts.filter((fact) => orderIds.includes(fact.orderId)));
  }
  expectedOn(): Promise<readonly DeliveryOrderRef[]> {
    return Promise.resolve([]);
  }
  departureSheetsOf(): Promise<readonly DepartureSheet[]> {
    return Promise.resolve([]);
  }
  stopPointsOf(): Promise<readonly DeliveryStopPoint[]> {
    return Promise.resolve([]);
  }
}

/** Une commande vue par le canal du commerce. */
export function orderFact(
  orderId: string,
  options: { readonly delivery?: boolean; readonly cancelled?: boolean } = {},
): DeliveryOrderFacts {
  return {
    orderId,
    reference: `REF-${orderId}`,
    status: options.cancelled === true ? "cancelled" : "active",
    customerLabel: "Client",
    day: null,
    delivery: options.delivery ?? true,
  };
}

/** La table, en mémoire : elle range l'état lu par l'agrégat, comme l'adaptateur. */
export class InMemoryDayReadiness extends DeliveryDayReadinessRepository {
  readonly rows = new Map<string, DeliveryDayReadinessState>();

  load(serviceDay: string): Promise<DeliveryDayReadiness | null> {
    const row = this.rows.get(serviceDay);
    return Promise.resolve(row === undefined ? null : DeliveryDayReadiness.restore(row));
  }

  save(readiness: DeliveryDayReadiness): Promise<void> {
    this.rows.set(readiness.serviceDay, {
      serviceDay: readiness.serviceDay,
      closedAt: readiness.closedAt,
      deliveryOrderIds: readiness.deliveryOrderIds,
      createdAt: readiness.createdAt,
      updatedAt: readiness.updatedAt,
    });
    return Promise.resolve();
  }
}

export class FixedMeasuredVehicles extends MeasuredVehiclesReader {
  constructor(public ids: readonly string[]) {
    super();
  }
  measuredIds(): Promise<readonly string[]> {
    return Promise.resolve(this.ids);
  }
}

export class FixedActiveBinTypes extends ActiveBinTypesReader {
  constructor(public ids: readonly string[]) {
    super();
  }
  activeIds(): Promise<readonly string[]> {
    return Promise.resolve(this.ids);
  }
}
