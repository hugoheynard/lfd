import { CounterHandoverDesk } from "../../../../../handover/channels/commerce/index.js";
import {
  ShortfallDesk,
  ShortfallFreezeDesk,
  type DepartingLine,
  type ShortfallReportedLine,
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
  ShortfallDecisionSubject,
} from "../../../domain/entities/shortfall-decision.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { ShortfallSignalOutrunError } from "../../../domain/errors/order-shortfall-errors.js";
import {
  CardOrderShortfallError,
  NothingDepartsError,
} from "../../../domain/errors/shortfall-decision-errors.js";
import { OrderShortfallRepository } from "../../../domain/ports/order-shortfall.repository.js";
import {
  ShortfallDecisionRepository,
  type LockedShortfallSubject,
} from "../../../domain/ports/shortfall-decision.repository.js";
import { ShortfallDeparture } from "../../services/shortfall-departure.js";
import { HandOverPackedAtCounterCommand } from "../hand-over-packed-at-counter.command.js";
import { HandOverPackedAtCounterHandler } from "../hand-over-packed-at-counter.handler.js";
import { RecordingDeliveryNoteFollowing } from "./delivery-note-following-double.js";
import { RecordingDurable } from "./durable-doubles.js";

// Instants comparés entre eux, jamais à l'horloge.
const POSTE_SIGNAL_AT = new Date(1_000);
const NOW = new Date(5_000);

/** L'ordre des gestes est ce que le test éprouve. */
type Trace = string[];

class Refusal extends BusinessError {
  constructor(code: string) {
    super(code, `refus ${code}`);
  }
}

class LockedOrders extends ShortfallDecisionRepository {
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

class Signals extends OrderShortfallRepository {
  readonly saved: OrderShortfallSnapshot[] = [];

  constructor(private readonly trace: Trace) {
    super();
  }

  lock(): Promise<OrderShortfall | null> {
    return Promise.reject(new RangeError("le signal se lit avec la commande verrouillée"));
  }

  save(shortfall: OrderShortfall): Promise<void> {
    this.trace.push("save-signal");
    this.saved.push(shortfall.toSnapshot());
    return Promise.resolve();
  }
}

class Counter extends CounterHandoverDesk {
  constructor(
    private readonly trace: Trace,
    private readonly refusal: BusinessError | null = null,
  ) {
    super();
  }

  vet(): Promise<void> {
    this.trace.push("vet-handover");
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  handOver(_orderId: string, by: string): Promise<void> {
    this.trace.push(`hand-over:${by}`);
    return Promise.resolve();
  }
}

class Bins extends ShortfallFreezeDesk {
  constructor(
    private readonly trace: Trace,
    private readonly answer: readonly ShortfallReportedLine[] | BusinessError,
  ) {
    super();
  }

  freeze(): Promise<readonly ShortfallReportedLine[]> {
    this.trace.push("freeze-bin");
    return this.answer instanceof BusinessError
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

class Sheets extends ShortfallDesk {
  readonly authorized: (readonly DepartingLine[])[] = [];

  constructor(private readonly trace: Trace) {
    super();
  }

  authorize(_orderId: string, _rank: number, departing: readonly DepartingLine[]): Promise<void> {
    this.trace.push("authorize-sheet");
    this.authorized.push(departing);
    return Promise.resolve();
  }
}

function locked(
  overrides: Partial<ShortfallDecisionSubject> = {},
  posteSignal: readonly ShortfallReportedLine[] | null = null,
): LockedShortfallSubject {
  return {
    subject: {
      orderId: "ord_1",
      reference: "ORD-0001",
      rank: 1,
      status: "confirmed",
      remainderNoteStatus: null,
      settlementRegime: "account",
      voucherDiscountCents: 0,
      frozenTerms: [],
      decided: false,
      ...overrides,
    },
    placedByUserId: "u_1",
    shortfall: {
      orderId: "ord_1",
      rank: 1,
      reference: "ORD-0001",
      reportedAt: posteSignal === null ? null : POSTE_SIGNAL_AT,
      lines: posteSignal,
      clearedAt: null,
    },
  };
}

const IN_BIN: readonly ShortfallReportedLine[] = [
  { sku: "CRO", due: 12, packed: 9 },
  { sku: "PAC", due: 6, packed: 6 },
];

function scene(options: {
  readonly subject?: LockedShortfallSubject | null;
  readonly counterRefusal?: BusinessError;
  readonly bin?: readonly ShortfallReportedLine[] | BusinessError;
}) {
  const trace: Trace = [];
  const orders = new LockedOrders(
    trace,
    options.subject === undefined ? locked() : options.subject,
  );
  const signals = new Signals(trace);
  const sheets = new Sheets(trace);
  const notes = new RecordingDeliveryNoteFollowing();
  const durable = new RecordingDurable();
  const clock = new FixedClock(NOW);
  const departure = new ShortfallDeparture(
    orders,
    signals,
    sheets,
    notes,
    durable,
    new FixedIdGenerator("dec"),
    clock,
  );
  const handler = new HandOverPackedAtCounterHandler(
    orders,
    new Counter(trace, options.counterRefusal ?? null),
    new Bins(trace, options.bin ?? IN_BIN),
    departure,
    clock,
    new DirectUnitOfWork(),
  );
  return { trace, orders, signals, sheets, notes, durable, handler };
}

const COMMAND = new HandOverPackedAtCounterCommand("ord_1", "staff_9", "abandoned");

describe("HandOverPackedAtCounterHandler — le départ incomplet décidé au comptoir", () => {
  it("verrouille, juge, fige le bac, écrit signal puis décision, réécrit le BL, puis remet", async () => {
    const { trace, handler, signals, orders, sheets, notes, durable } = scene({});

    await handler.execute(COMMAND);

    expect(trace).toEqual([
      "lock-order",
      "vet-handover",
      "freeze-bin",
      "authorize-sheet",
      "save-signal",
      "save-decision",
      "hand-over:staff_9",
    ]);
    expect(signals.saved[0]).toMatchObject({ reportedAt: NOW, lines: IN_BIN, decidedAt: NOW });
    expect(orders.saved[0]).toMatchObject({
      decidedBy: "staff_9",
      remainder: "abandoned",
      departing: [
        { sku: "CRO", quantity: 9 },
        { sku: "PAC", quantity: 6 },
      ],
      signalReportedAt: NOW,
    });
    expect(sheets.authorized).toHaveLength(1);
    expect(notes.calls).toEqual(["follow-decision:ord_1"]);
    expect(durable.facts.map((fact) => fact.type)).toEqual(["order.shortfall_decided"]);
  });

  it("reprend le bac relu quand « Il manque » a été pressé au poste juste avant", async () => {
    const posteSignal = [{ sku: "CRO", due: 12, packed: 4 }];
    const { handler, orders } = scene({ subject: locked({}, posteSignal) });

    await handler.execute(COMMAND);

    expect(orders.saved[0]?.signalReportedAt).toEqual(NOW);
    expect(orders.saved[0]?.departing[0]).toEqual({ sku: "CRO", quantity: 9 });
  });

  it("refuse une commande inconnue sans rien juger", async () => {
    const { handler, trace } = scene({ subject: null });

    await expect(handler.execute(COMMAND)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(trace).toEqual(["lock-order"]);
  });

  it("une remise refusée n'écrit RIEN — ni bac figé, ni signal, ni décision, ni BL", async () => {
    const refusal = new Refusal("handover.refused");
    const { handler, trace, notes, durable } = scene({ counterRefusal: refusal });

    await expect(handler.execute(COMMAND)).rejects.toBe(refusal);
    expect(trace).toEqual(["lock-order", "vet-handover"]);
    expect(notes.calls).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse une commande par carte AVANT de figer le bac", async () => {
    const { handler, trace } = scene({ subject: locked({ settlementRegime: "paid" }) });

    await expect(handler.execute(COMMAND)).rejects.toBeInstanceOf(CardOrderShortfallError);
    expect(trace).toEqual(["lock-order", "vet-handover"]);
  });

  it("laisse passer le refus du colisage, sans écrire côté commerce", async () => {
    const refusal = new Refusal("packing.shortfall.nothing_short");
    const { handler, trace } = scene({ bin: refusal });

    await expect(handler.execute(COMMAND)).rejects.toBe(refusal);
    expect(trace).toEqual(["lock-order", "vet-handover", "freeze-bin"]);
  });

  it("refuse un bac où rien n'est posé, avant toute écriture côté commerce", async () => {
    const { handler, trace } = scene({ bin: [{ sku: "CRO", due: 12, packed: 0 }] });

    await expect(handler.execute(COMMAND)).rejects.toBeInstanceOf(NothingDepartsError);
    expect(trace).toEqual(["lock-order", "vet-handover", "freeze-bin"]);
  });

  it("refuse quand un fait plus récent du colisage est déjà connu", async () => {
    const subject = locked();
    const later = { ...subject, shortfall: { ...subject.shortfall, clearedAt: new Date(9_000) } };
    const { handler, trace } = scene({ subject: later });

    await expect(handler.execute(COMMAND)).rejects.toBeInstanceOf(ShortfallSignalOutrunError);
    expect(trace).toEqual(["lock-order", "vet-handover", "freeze-bin"]);
  });
});
