import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../../../orders/domain/ports/order-lines-for-delivery-note.js";
import {
  OrderProgressForDeliveryNote,
  OrdersToReconcileDeliveryNotes,
  type DeliveryNoteOrderProgress,
} from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  OrderBilling,
  type OrderBillingSnapshot,
} from "../../../orders/domain/entities/order-billing.js";
import {
  AccountOrderEngagementReader,
  type AccountEngagement,
} from "../../../orders/domain/ports/account-order-engagement.js";
import { OrderBillingRepository } from "../../../orders/domain/ports/order-billing.repository.js";
import {
  ShortfallDecisionReader,
  type DecidedDeparture,
} from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { DeliveryNote, type DeliveryNoteState } from "../../domain/entities/delivery-note.js";
import { OrderBillingCloser } from "../services/order-billing-closer.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";

/**
 * Doubles des bons de livraison, écrits à la main en héritant des ports. Le
 * dépôt garde des ÉTATS, pas des agrégats : une prévision qui oublierait
 * `save` ne verrait pas sa mutation fuiter dans le double.
 */
export class InMemoryDeliveryNotes extends DeliveryNoteRepository {
  readonly rows = new Map<string, DeliveryNoteState>();
  saves = 0;

  loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]> {
    const states = [...this.rows.values()].filter((row) => orderIds.includes(row.orderId));
    return Promise.resolve(states.map((state) => DeliveryNote.rehydrate(state)));
  }

  save(note: DeliveryNote): Promise<void> {
    const state = note.toState();
    const clash = [...this.rows.values()].find(
      (row) => row.id !== state.id && row.orderId === state.orderId && row.rank === state.rank,
    );
    if (clash !== undefined) {
      // L'unicité `(order_id, rank)` de la base.
      return Promise.reject(new Error(`unique (order_id, rank) : ${state.number}`));
    }
    this.saves += 1;
    this.rows.set(state.id, state);
    return Promise.resolve();
  }

  saveNew(note: DeliveryNote): Promise<boolean> {
    const state = note.toState();
    const clash = [...this.rows.values()].some(
      (row) => row.orderId === state.orderId && row.rank === state.rank,
    );
    if (clash) {
      return Promise.resolve(false);
    }
    this.saves += 1;
    this.rows.set(state.id, state);
    return Promise.resolve(true);
  }

  /** Les états, par commande — l'ordre d'insertion. */
  forOrder(orderId: string): readonly DeliveryNoteState[] {
    return [...this.rows.values()].filter((row) => row.orderId === orderId);
  }
}

/**
 * Les commandes confirmées, par instant d'arrêt : rend celles de `orderIds`
 * que l'arrêt de `closedAt` a confirmées, comme le `WHERE` de l'adaptateur.
 */
export class FixedConfirmedOrders extends OrderLinesForDeliveryNote {
  readonly confirmedAt = new Map<string, Date>();
  readonly orders = new Map<string, DeliveryNoteOrder>();

  confirm(order: DeliveryNoteOrder, at: Date): void {
    this.orders.set(order.orderId, order);
    this.confirmedAt.set(order.orderId, at);
  }

  confirmedByPlan(
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<readonly DeliveryNoteOrder[]> {
    return Promise.resolve(
      orderIds.flatMap((id) => {
        const order = this.orders.get(id);
        const at = this.confirmedAt.get(id);
        return order !== undefined && at?.getTime() === closedAt.getTime() ? [order] : [];
      }),
    );
  }
}

/**
 * Les commandes vues du BL qui les suit (plan E2) : une table en mémoire, lue
 * par le geste et parcourue par le réconciliateur, par identifiant croissant.
 */
export class InMemoryOrderProgress extends OrderProgressForDeliveryNote {
  readonly orders = new Map<string, DeliveryNoteOrderProgress>();
  readonly locked: string[] = [];

  put(order: DeliveryNoteOrderProgress): void {
    this.orders.set(order.orderId, order);
  }

  progressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null> {
    return Promise.resolve(this.orders.get(orderId) ?? null);
  }

  /** Le parcours du réconciliateur, sur la même table. */
  readonly scan: OrdersToReconcileDeliveryNotes = new InMemoryOrderScan(this);
}

class InMemoryOrderScan extends OrdersToReconcileDeliveryNotes {
  constructor(private readonly table: InMemoryOrderProgress) {
    super();
  }

  pageAfter(afterId: string | null, limit: number): Promise<readonly DeliveryNoteOrderProgress[]> {
    const sorted = [...this.table.orders.values()]
      .filter((order) => order.status !== "placed")
      .filter((order) => afterId === null || order.orderId > afterId)
      .sort((a, b) => (a.orderId < b.orderId ? -1 : 1));
    return Promise.resolve(sorted.slice(0, limit));
  }

  lockProgressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null> {
    this.table.locked.push(orderId);
    return this.table.progressOf(orderId);
  }
}

/** Les décisions de départ incomplet (E6b), posées par le test. */
export class InMemoryShortfallDecisions extends ShortfallDecisionReader {
  readonly decided = new Map<string, DecidedDeparture>();

  decidedFor(orderIds: readonly string[]): Promise<ReadonlyMap<string, DecidedDeparture>> {
    return Promise.resolve(
      new Map([...this.decided].filter(([orderId]) => orderIds.includes(orderId))),
    );
  }
}

/**
 * Le solde des commandes (E6c1) : des snapshots, rendus en agrégats neufs ;
 * `save` reproduit le `WHERE billable_total_cents IS NULL` de la pose.
 */
export class InMemoryOrderBillings extends OrderBillingRepository {
  readonly rows = new Map<string, OrderBillingSnapshot>();
  readonly writes: string[] = [];

  put(snapshot: OrderBillingSnapshot): void {
    this.rows.set(snapshot.orderId, snapshot);
  }

  load(orderIds: readonly string[]): Promise<readonly OrderBilling[]> {
    return Promise.resolve(
      orderIds.flatMap((id) => {
        const row = this.rows.get(id);
        return row === undefined ? [] : [OrderBilling.fromSnapshot(row)];
      }),
    );
  }

  lock(orderId: string): Promise<OrderBilling | null> {
    const row = this.rows.get(orderId);
    return Promise.resolve(row === undefined ? null : OrderBilling.fromSnapshot(row));
  }

  save(billing: OrderBilling): Promise<boolean> {
    const write = billing.pendingWrite;
    const current = this.rows.get(billing.orderId);
    if (write === null || current === undefined) {
      return Promise.resolve(false);
    }
    if (write === "closed" && current.billable !== null) {
      return Promise.resolve(false);
    }
    this.rows.set(billing.orderId, billing.toSnapshot());
    this.writes.push(`${write}:${billing.orderId}`);
    return Promise.resolve(true);
  }
}

/** L'engagement comptable, posé par le test ; « libre » par défaut. */
export class FixedEngagements extends AccountOrderEngagementReader {
  readonly invoiced = new Set<string>();

  engagementOf(orderId: string): Promise<AccountEngagement | null> {
    return Promise.resolve(
      this.invoiced.has(orderId)
        ? { kind: "invoiced", invoiceNumber: "F-TEST-1", issuedOn: "2030-01-31" }
        : { kind: "free" },
    );
  }
}

/** Le solde, monté sur ses doubles. */
export function billingCloserOf(
  notes: DeliveryNoteRepository,
  billings: OrderBillingRepository = new InMemoryOrderBillings(),
  engagements: AccountOrderEngagementReader = new FixedEngagements(),
): OrderBillingCloser {
  return new OrderBillingCloser(billings, notes, engagements, new DirectUnitOfWork());
}
