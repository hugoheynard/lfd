import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { SHORTFALL_BELL, ShortfallBell } from "../../services/shortfall-bell.js";
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

/**
 * Le dépôt en mémoire, par envoi `référence:rang` ; compte les écritures. Une
 * référence connue a un manque vide à tout rang, comme l'adaptateur.
 */
class InMemoryShortfalls extends OrderShortfallRepository {
  readonly rows = new Map<string, OrderShortfallSnapshot>();
  readonly known = new Set<string>();
  saves = 0;

  lock(reference: string, rank: number): Promise<OrderShortfall | null> {
    if (!this.known.has(reference)) {
      return Promise.resolve(null);
    }
    const row = this.rows.get(`${reference}:${String(rank)}`) ?? {
      orderId: "ord_1",
      rank,
      reference,
      reportedAt: null,
      lines: null,
      clearedAt: null,
    };
    return Promise.resolve(OrderShortfall.fromSnapshot(row));
  }

  save(shortfall: OrderShortfall): Promise<void> {
    this.saves += 1;
    const snapshot = shortfall.toSnapshot();
    this.rows.set(`${snapshot.reference}:${String(snapshot.rank)}`, snapshot);
    return Promise.resolve();
  }
}

/** La cloche : elle garde ce qu'on lui a fait sonner. */
class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

function setup() {
  const shortfalls = new InMemoryShortfalls();
  shortfalls.known.add("ORD-0001");
  const uow = new DirectUnitOfWork();
  const notifier = new RecordingNotifier();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  return {
    shortfalls,
    notifier,
    afterCommit,
    work,
    record: new RecordOrderShortfallHandler(
      shortfalls,
      uow,
      new ShortfallBell(notifier, afterCommit, work),
    ),
    clear: new ClearOrderShortfallHandler(shortfalls, uow),
  };
}

/** Valide la transaction, puis attend la cloche partie en arrière-plan. */
async function committed(scene: ReturnType<typeof setup>): Promise<readonly StaffNotice[]> {
  await scene.afterCommit.commit();
  await scene.work.whenIdle();
  return scene.notifier.notices;
}

describe("RecordOrderShortfallHandler / ClearOrderShortfallHandler (E6a)", () => {
  it("pose le manque sur la commande", async () => {
    const { record, shortfalls } = setup();

    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

    expect(shortfalls.rows.get("ORD-0001:1")).toMatchObject({ reportedAt: T1, lines: LINES });
  });

  it("n'écrit rien pour un fait plus ancien que l'état connu", async () => {
    const { record, shortfalls } = setup();
    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T2, LINES));

    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

    expect(shortfalls.saves).toBe(1);
    expect(shortfalls.rows.get("ORD-0001:1")?.reportedAt).toEqual(T2);
  });

  it("efface le manque quand le bac s'est fermé complet", async () => {
    const { record, clear, shortfalls } = setup();
    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

    await clear.execute(new ClearOrderShortfallCommand("ORD-0001", 1, T2));

    expect(shortfalls.rows.get("ORD-0001:1")).toMatchObject({ reportedAt: null, lines: null });
  });

  it("refuse une référence inconnue, des deux côtés", async () => {
    const { record, clear } = setup();

    await expect(
      record.execute(new RecordOrderShortfallCommand("ORD-9999", 1, T1, LINES)),
    ).rejects.toThrow(OrderReferenceNotFoundError);
    await expect(clear.execute(new ClearOrderShortfallCommand("ORD-9999", 1, T1))).rejects.toThrow(
      OrderReferenceNotFoundError,
    );
  });

  /** Plan E7 reliquat, LB : le manque d'un reliquat est le sien, celui de la commande n'en sait rien. */
  it("pose et efface le manque d'un reliquat à son rang, sans toucher le rang 1", async () => {
    const { record, clear, shortfalls } = setup();
    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

    await record.execute(new RecordOrderShortfallCommand("ORD-0001", 2, T1, LINES));
    await clear.execute(new ClearOrderShortfallCommand("ORD-0001", 2, T2));

    expect(shortfalls.rows.get("ORD-0001:1")).toMatchObject({ reportedAt: T1, lines: LINES });
    expect(shortfalls.rows.get("ORD-0001:2")).toMatchObject({
      rank: 2,
      reportedAt: null,
      clearedAt: T2,
    });
  });

  describe("la cloche de qui décide (D8)", () => {
    it("sonne une fois, après validation, chez `b2b_orders_shortfall:write`, avec le lien de la commande", async () => {
      const scene = setup();

      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

      expect(scene.notifier.notices).toEqual([]);
      const notices = await committed(scene);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        kind: SHORTFALL_BELL,
        subject: "Manque signalé — ORD-0001",
        link: "/commandes/ord_1",
        audience: "b2b_orders_shortfall:write",
        occurredAt: T1,
      });
    });

    it("ne sonne pas quand la transaction est annulée", async () => {
      const scene = setup();

      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));
      scene.afterCommit.discard();

      expect(await committed(scene)).toEqual([]);
    });

    it("ne resonne pas pour le même signalement rejoué, ni pour un fait plus ancien", async () => {
      const scene = setup();
      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T2, LINES));

      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T2, LINES));
      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));

      expect(await committed(scene)).toHaveLength(1);
    });

    it("sonne de nouveau pour un nouveau signalement, sous une autre clé", async () => {
      const scene = setup();
      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T1, LINES));
      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 1, T2, LINES));

      const notices = await committed(scene);

      expect(new Set(notices.map((notice) => notice.idempotencyKey)).size).toBe(2);
    });

    it("nomme le reste quand le manque est celui d'un reliquat", async () => {
      const scene = setup();

      await scene.record.execute(new RecordOrderShortfallCommand("ORD-0001", 2, T1, LINES));

      const [notice] = await committed(scene);
      expect(notice?.body).toContain("le reste (envoi 2) de la commande ORD-0001");
    });
  });
});
