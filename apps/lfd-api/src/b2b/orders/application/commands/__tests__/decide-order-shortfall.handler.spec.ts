import {
  ShortfallDesk,
  type DepartingLine,
} from "../../../../../packing/channels/commerce/index.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type {
  OrderShortfall,
  OrderShortfallSnapshot,
} from "../../../domain/entities/order-shortfall.js";
import type {
  ShortfallDecision,
  ShortfallDecisionSnapshot,
} from "../../../domain/entities/shortfall-decision.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CardOrderShortfallError,
  NothingDepartsError,
} from "../../../domain/errors/shortfall-decision-errors.js";
import { OrderShortfallRepository } from "../../../domain/ports/order-shortfall.repository.js";
import {
  ShortfallDecisionRepository,
  type LockedShortfallSubject,
} from "../../../domain/ports/shortfall-decision.repository.js";
import { DecideOrderShortfallCommand } from "../decide-order-shortfall.command.js";
import { DecideOrderShortfallHandler } from "../decide-order-shortfall.handler.js";
import { RecordingDeliveryNoteFollowing } from "./delivery-note-following-double.js";
import { RecordingDurable } from "./durable-doubles.js";

// Instants comparés entre eux, jamais à l'horloge.
const NOW = new Date(5_000);
const REPORTED_AT = new Date(1_000);

/** Une trace commune : l'ordre des gestes est ce que le test éprouve. */
type Trace = string[];

class FixedSubjects extends ShortfallDecisionRepository {
  readonly saved: ShortfallDecisionSnapshot[] = [];

  constructor(
    private readonly trace: Trace,
    private readonly locked: LockedShortfallSubject | null,
  ) {
    super();
  }

  lockSubject(): Promise<LockedShortfallSubject | null> {
    this.trace.push("lock-order");
    return Promise.resolve(this.locked);
  }

  save(decision: ShortfallDecision): Promise<void> {
    this.trace.push("save-decision");
    this.saved.push(decision.toSnapshot());
    return Promise.resolve();
  }
}

class RecordingShortfalls extends OrderShortfallRepository {
  readonly saved: OrderShortfallSnapshot[] = [];

  constructor(private readonly trace: Trace) {
    super();
  }

  lock(): Promise<OrderShortfall | null> {
    return Promise.reject(new RangeError("la décision lit le signal avec la commande"));
  }

  save(shortfall: OrderShortfall): Promise<void> {
    this.trace.push("save-signal");
    this.saved.push(shortfall.toSnapshot());
    return Promise.resolve();
  }
}

class RecordingDesk extends ShortfallDesk {
  readonly authorized: { orderId: string; departing: readonly DepartingLine[]; by: string }[] = [];

  constructor(
    private readonly trace: Trace,
    private readonly refusal: BusinessError | null = null,
  ) {
    super();
  }

  authorize(orderId: string, departing: readonly DepartingLine[], by: string): Promise<void> {
    this.trace.push("authorize-sheet");
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.authorized.push({ orderId, departing, by });
    return Promise.resolve();
  }
}

class BoxClosedError extends BusinessError {
  constructor() {
    super("packing.shortfall.sheet_sealed", "Le bac est déjà fermé complet.");
  }
}

type SignalLine = { readonly sku: string; readonly due: number; readonly packed: number };

function locked(
  settlementRegime: "account" | "paid" = "account",
  lines: readonly SignalLine[] = [{ sku: "CRO", due: 12, packed: 9 }],
): LockedShortfallSubject {
  return {
    subject: {
      orderId: "ord_1",
      reference: "ORD-0001",
      status: "confirmed",
      settlementRegime,
      voucherDiscountCents: 0,
      frozenTerms: [],
      decided: false,
    },
    placedByUserId: "u_1",
    shortfall: {
      orderId: "ord_1",
      reference: "ORD-0001",
      reportedAt: REPORTED_AT,
      lines,
      clearedAt: null,
    },
  };
}

function scene(subject: LockedShortfallSubject | null, refusal: BusinessError | null = null) {
  const trace: Trace = [];
  const decisions = new FixedSubjects(trace, subject);
  const shortfalls = new RecordingShortfalls(trace);
  const desk = new RecordingDesk(trace, refusal);
  const notes = new RecordingDeliveryNoteFollowing();
  const durable = new RecordingDurable();
  const handler = new DecideOrderShortfallHandler(
    decisions,
    shortfalls,
    desk,
    notes,
    durable,
    new FixedIdGenerator("dec"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  return { trace, decisions, shortfalls, desk, notes, durable, handler };
}

const COMMAND = new DecideOrderShortfallCommand("ord_1", "staff_1", "abandoned");

describe("DecideOrderShortfallHandler — « Décider du départ » (E6b)", () => {
  it("verrouille la commande, puis la fiche ; écrit la décision et le signal résolu ; réécrit le BL", async () => {
    const { trace, decisions, shortfalls, desk, notes, handler } = scene(locked());

    await handler.execute(COMMAND);

    expect(trace).toEqual(["lock-order", "authorize-sheet", "save-decision", "save-signal"]);
    expect(desk.authorized).toEqual([
      { orderId: "ord_1", departing: [{ sku: "CRO", quantity: 9 }], by: "staff_1" },
    ]);
    expect(decisions.saved[0]).toMatchObject({
      decidedAt: NOW,
      decidedBy: "staff_1",
      remainder: "abandoned",
    });
    expect(shortfalls.saved[0]).toMatchObject({ reportedAt: REPORTED_AT, decidedAt: NOW });
    expect(notes.calls).toEqual(["follow-decision:ord_1"]);
  });

  it("inscrit la décision au journal : auteur, ce qui part, le reste (plan E6c2, § 5)", async () => {
    const { durable, handler } = scene(locked());

    await handler.execute(COMMAND);

    expect(durable.facts).toEqual([
      {
        type: "order.shortfall_decided",
        key: "order.shortfall_decided:ord_1",
        payload: {
          orderId: "ord_1",
          rank: 1,
          orderNumber: "ORD-0001",
          placedByUserId: "u_1",
          decidedByStaffId: "staff_1",
          departing: [{ sku: "CRO", quantity: 9 }],
          remainder: "abandoned",
        },
      },
    ]);
  });

  /** Régression : une ligne à 0 au bac faisait tomber la décision en erreur technique. */
  it("une ligne à 0 au bac ne casse plus la décision : elle part à 0 vers le colisage", async () => {
    const lines = [
      { sku: "CRO", due: 12, packed: 12 },
      { sku: "PAI", due: 4, packed: 0 },
    ];
    const { desk, decisions, handler } = scene(locked("account", lines));

    await handler.execute(COMMAND);

    expect(desk.authorized[0]?.departing).toEqual([
      { sku: "CRO", quantity: 12 },
      { sku: "PAI", quantity: 0 },
    ]);
    expect(decisions.saved).toHaveLength(1);
  });

  it("rien au bac : refusé avant le colisage, rien n'est écrit", async () => {
    const lines = [{ sku: "PAI", due: 4, packed: 0 }];
    const { trace, notes, handler } = scene(locked("account", lines));

    await expect(handler.execute(COMMAND)).rejects.toThrow(NothingDepartsError);
    expect(trace).toEqual(["lock-order"]);
    expect(notes.calls).toEqual([]);
  });

  it("un refus de l'agrégat n'écrit rien, et le colisage n'est pas appelé", async () => {
    const { trace, notes, handler } = scene(locked("paid"));

    await expect(handler.execute(COMMAND)).rejects.toThrow(CardOrderShortfallError);
    expect(trace).toEqual(["lock-order"]);
    expect(notes.calls).toEqual([]);
  });

  it("un refus du colisage (bac fermé) n'écrit ni décision ni signal", async () => {
    const { trace, notes, durable, handler } = scene(locked(), new BoxClosedError());

    await expect(handler.execute(COMMAND)).rejects.toThrow(BoxClosedError);
    expect(trace).toEqual(["lock-order", "authorize-sheet"]);
    expect(durable.facts).toEqual([]);
    expect(notes.calls).toEqual([]);
  });

  it("une commande inconnue est une 404", async () => {
    await expect(scene(null).handler.execute(COMMAND)).rejects.toThrow(OrderNotFoundError);
  });
});
