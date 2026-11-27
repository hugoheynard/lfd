import {
  orderLine,
  producibleOrder,
} from "../../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type {
  ProducibleLine,
  ProducibleOrder,
} from "../../../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../../../channels/commerce/day-resupplies.reader.js";
import {
  PlanVersion,
  type PlanVersionAuthor,
  type PlanVersionCause,
  type WithdrawalEntry,
} from "../../../entities/plan-version.js";
import { ProductionDay } from "../../../entities/production-day.js";
import { ServiceDay } from "../../../value-objects/service-day.value-object.js";

/**
 * Une journée jouée geste par geste, dont chaque geste garde sa version par
 * la fabrique du domaine (`PlanVersion.next`) — jamais une version écrite à
 * la main. Dates comparées entre elles seulement (exception étroite du § 5
 * de CLAUDE.md) : la comparaison ne lit pas l'horloge.
 */

export const EVENING = new Date("2026-11-27T18:00:00.000Z");
export const NIGHT = new Date("2026-11-27T21:00:00.000Z");
export const MORNING = new Date("2026-11-28T05:00:00.000Z");
export const MARIE: PlanVersionAuthor = { kind: "staff", staffId: "staff-1", name: "Marie Dupont" };
export const CUSTOMER: PlanVersionAuthor = { kind: "customer" };
const NONE: ReadonlySet<string> = new Set<string>();
const IDLE = { packingStarted: false, dispatchStarted: false };

export function order(orderId: string, overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return producibleOrder(orderId, overrides);
}

export function weighed(sku: string, grams: number, productName = sku): ProducibleLine {
  return { ...orderLine(sku, grams, productName), saleUnit: "weight" };
}

export { orderLine };

export function resupply(resupplyId: string, lines: readonly ProducibleLine[]): PlacedResupply {
  return {
    resupplyId,
    siteId: "site-1",
    siteLabel: "Vitrine",
    name: null,
    servedByTransfer: false,
    arrivalBy: null,
    lines: lines.map(({ sku, productName, quantity, saleUnit }) => ({
      sku,
      productName,
      quantity,
      saleUnit,
    })),
  };
}

/** La journée et ses versions, dans l'ordre où elles sont gardées. */
export class PlayedDay {
  readonly day = ProductionDay.open(ServiceDay.of("2026-11-28"));
  readonly versions: PlanVersion[] = [];
  private readonly withdrawals: WithdrawalEntry[] = [];
  private stamps = 0;

  close(
    orders: readonly ProducibleOrder[],
    at: Date = EVENING,
    resupplies: readonly PlacedResupply[] = [],
    by: PlanVersionAuthor = MARIE,
  ): this {
    const withdrawn = new Set(this.withdrawals.map((entry) => entry.orderId));
    this.day.close(orders, withdrawn, at, null, resupplies);
    return this.keep("closed", by);
  }

  retake(orders: readonly ProducibleOrder[], at: Date = NIGHT): this {
    this.day.retake(orders, NONE, at, "staff-1", "Marie Dupont");
    return this.keep("retaken", MARIE);
  }

  revise(orderId: string, lines: readonly { sku: string; quantity: number }[]): this {
    this.day.reviseOrder(orderId, lines);
    return this.keep("order_revised", { kind: "staff", staffId: "staff-2", name: null });
  }

  withdraw(orderId: string, by: PlanVersionAuthor = CUSTOMER, at: Date = NIGHT): this {
    this.withdrawals.push({ orderId, at, by });
    return this.keep("order_withdrawn", by);
  }

  launch(placed: PlacedResupply, at: Date = NIGHT): this {
    this.day.launchResupply(
      placed,
      { at, staffUserId: "staff-1", name: "Marie Dupont" },
      { orders: [], withdrawn: NONE, resupplies: [] },
    );
    return this.keep("resupply_launched", MARIE);
  }

  reopen(at: Date = NIGHT): this {
    this.day.reopen(IDLE, at, "staff-1");
    return this;
  }

  private keep(cause: PlanVersionCause, by: PlanVersionAuthor): this {
    this.stamps += 1;
    const version = PlanVersion.next(
      this.versions[this.versions.length - 1] ?? null,
      this.day.toSnapshot(),
      cause,
      this.withdrawals,
      by,
      { id: `v_${this.stamps}`, at: new Date(EVENING.getTime() + this.stamps * 60_000) },
    );
    if (version !== null) {
      this.versions.push(version);
    }
    return this;
  }
}
