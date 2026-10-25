import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  OrderShortfall,
  type OrderShortfallSnapshot,
} from "../../../domain/entities/order-shortfall.js";
import { OrderReferenceNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderShortfallRepository } from "../../../domain/ports/order-shortfall.repository.js";
import { ClearOrderShortfallCommand } from "../clear-order-shortfall.command.js";
import { ClearOrderShortfallHandler } from "../clear-order-shortfall.handler.js";
import { RecordOrderShortfallCommand } from "../record-order-shortfall.command.js";
import { RecordOrderShortfallHandler } from "../record-order-shortfall.handler.js";

// Instants comparés entre eux, jamais à l'horloge.
const T1 = new Date(1_000);
const T2 = new Date(2_000);
const LINES = [{ sku: "CRO", due: 12, packed: 9 }];

/** Le dépôt en mémoire, par référence ; compte les écritures. */
class InMemoryShortfalls extends OrderShortfallRepository {
  readonly rows = new Map<string, OrderShortfallSnapshot>();
  saves = 0;

  lock(reference: string): Promise<OrderShortfall | null> {
    const row = this.rows.get(reference);
    return Promise.resolve(row === undefined ? null : OrderShortfall.fromSnapshot(row));
  }

  save(shortfall: OrderShortfall): Promise<void> {
    this.saves += 1;
    const snapshot = shortfall.toSnapshot();
    this.rows.set(snapshot.reference, snapshot);
    return Promise.resolve();
  }
}

function setup() {
  const shortfalls = new InMemoryShortfalls();
  shortfalls.rows.set("ORD-0001", {
    orderId: "ord_1",
    reference: "ORD-0001",
    reportedAt: null,
    lines: null,
    clearedAt: null,
  });
  const uow = new DirectUnitOfWork();
  return {
    shortfalls,
    record: new RecordOrderShortfallHandler(shortfalls, uow),
    clear: new ClearOrderShortfallHandler(shortfalls, uow),
  };
}

describe("RecordOrderShortfallHandler / ClearOrderShortfallHandler (E6a)", () => {
  it("pose le manque sur la commande", async () => {
    const { record, shortfalls } = setup();

    await record.execute(new RecordOrderShortfallCommand("ORD-0001", T1, LINES));

    expect(shortfalls.rows.get("ORD-0001")).toMatchObject({ reportedAt: T1, lines: LINES });
  });

  it("n'écrit rien pour un fait plus ancien que l'état connu", async () => {
    const { record, shortfalls } = setup();
    await record.execute(new RecordOrderShortfallCommand("ORD-0001", T2, LINES));

    await record.execute(new RecordOrderShortfallCommand("ORD-0001", T1, LINES));

    expect(shortfalls.saves).toBe(1);
    expect(shortfalls.rows.get("ORD-0001")?.reportedAt).toEqual(T2);
  });

  it("efface le manque quand le bac s'est fermé complet", async () => {
    const { record, clear, shortfalls } = setup();
    await record.execute(new RecordOrderShortfallCommand("ORD-0001", T1, LINES));

    await clear.execute(new ClearOrderShortfallCommand("ORD-0001", T2));

    expect(shortfalls.rows.get("ORD-0001")).toMatchObject({ reportedAt: null, lines: null });
  });

  it("refuse une référence inconnue, des deux côtés", async () => {
    const { record, clear } = setup();

    await expect(
      record.execute(new RecordOrderShortfallCommand("ORD-9999", T1, LINES)),
    ).rejects.toThrow(OrderReferenceNotFoundError);
    await expect(clear.execute(new ClearOrderShortfallCommand("ORD-9999", T1))).rejects.toThrow(
      OrderReferenceNotFoundError,
    );
  });
});
