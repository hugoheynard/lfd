import {
  CounterHandoverPreviewReader,
  type CounterHandoverPreview,
} from "../../../../../handover/channels/commerce/index.js";
import {
  ShortfallPreviewReader,
  type PackingShortfallPreview,
} from "../../../../../packing/channels/commerce/index.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { ShortfallDecisionSubject } from "../../../domain/entities/shortfall-decision.js";
import {
  CounterShortfallDecisionReader,
  type DecidedShortfall,
} from "../../../domain/ports/counter-shortfall-decision.reader.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { ShortfallDecisionSubjectReader } from "../../../domain/ports/shortfall-decision-subject.reader.js";
import { GetCounterIncompleteHandoverHandler } from "../get-counter-incomplete-handover.handler.js";
import { GetCounterIncompleteHandoverQuery } from "../get-counter-incomplete-handover.query.js";

/**
 * **L'aperçu du départ incomplet au comptoir** (lot C1b, 2026-11-03) : le
 * premier refus dans l'ordre du geste, et le bac quand il se lit.
 */

function subject(overrides: Partial<ShortfallDecisionSubject> = {}): ShortfallDecisionSubject {
  return {
    orderId: "ord_1",
    reference: "ORD-0001",
    rank: 1,
    status: "confirmed",
    remainderNoteStatus: null,
    settlementRegime: "account",
    increasePending: false,
    voucherDiscountCents: 0,
    frozenTerms: [],
    decided: false,
    ...overrides,
  };
}

class Subjects extends ShortfallDecisionSubjectReader {
  constructor(private readonly found: ShortfallDecisionSubject | null) {
    super();
  }

  subjectOf(): Promise<ShortfallDecisionSubject | null> {
    return Promise.resolve(this.found);
  }
}

class Counter extends CounterHandoverPreviewReader {
  constructor(private readonly preview: CounterHandoverPreview) {
    super();
  }

  previewOf(): Promise<CounterHandoverPreview> {
    return Promise.resolve(this.preview);
  }
}

class Bins extends ShortfallPreviewReader {
  readonly asked: string[] = [];

  constructor(private readonly preview: PackingShortfallPreview) {
    super();
  }

  previewOf(orderId: string): Promise<PackingShortfallPreview> {
    this.asked.push(orderId);
    return Promise.resolve(this.preview);
  }
}

class Decisions extends CounterShortfallDecisionReader {
  readonly asked: string[] = [];

  constructor(private readonly found: DecidedShortfall | null) {
    super();
  }

  decisionOf(orderId: string): Promise<DecidedShortfall | null> {
    this.asked.push(orderId);
    return Promise.resolve(this.found);
  }
}

// Un instant comparé à rien d'autre qu'à lui-même : rendu tel quel en ISO.
const DECIDED_AT = new Date(1_900_000_000_000);

const DECIDED: DecidedShortfall = {
  decidedAt: DECIDED_AT,
  decidedBy: "staff_7",
  lines: [{ sku: "CRO", productName: "Croissant", saleUnit: "piece", due: 3, departing: 1 }],
};

const SHORT: PackingShortfallPreview = {
  kind: "short",
  lines: [
    { sku: "CRO", productName: "Croissant", saleUnit: "piece", due: 3, packed: 1 },
    { sku: "SAU", productName: "Saumon", saleUnit: "weight", due: 500, packed: 0 },
  ],
};

const SHORT_LINES = [
  {
    sku: "CRO",
    productName: "Croissant",
    saleUnit: "piece",
    due: 3,
    departing: 1,
    notDeparting: 2,
  },
  {
    sku: "SAU",
    productName: "Saumon",
    saleUnit: "weight",
    due: 500,
    departing: 0,
    notDeparting: 500,
  },
];

interface Scene {
  readonly found?: ShortfallDecisionSubject | null;
  readonly counter?: CounterHandoverPreview;
  readonly bin?: PackingShortfallPreview;
  readonly decided?: DecidedShortfall | null;
}

function scene(options: Scene = {}) {
  const bins = new Bins(options.bin ?? SHORT);
  const decisions = new Decisions(options.decided === undefined ? DECIDED : options.decided);
  const handler = new GetCounterIncompleteHandoverHandler(
    new Subjects(options.found === undefined ? subject() : options.found),
    new Counter(options.counter ?? { kind: "open" }),
    bins,
    decisions,
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Léa", lastName: "Martin" }, "staff_7"),
    ),
  );
  return {
    bins,
    decisions,
    run: () => handler.execute(new GetCounterIncompleteHandoverQuery("ord_1")),
  };
}

describe("GetCounterIncompleteHandoverHandler — l'aperçu avant le geste", () => {
  it("éligible : ce qui part et ce qui ne part pas, ligne par ligne", async () => {
    expect(await scene().run()).toEqual({
      orderId: "ord_1",
      refusal: null,
      handoverRefusalReason: null,
      lines: SHORT_LINES,
      decision: null,
    });
  });

  it("hors de portée : le code, sans lire le bac", async () => {
    const { run, bins } = scene({ counter: { kind: "out_of_reach", refusal: "not_a_pickup" } });

    expect(await run()).toEqual({
      orderId: "ord_1",
      refusal: "not_a_pickup",
      handoverRefusalReason: null,
      lines: [],
      decision: null,
    });
    expect(bins.asked).toEqual([]);
  });

  it("remise refusée : la phrase du retrait, avant la carte — le bac reste montré", async () => {
    const view = await scene({
      found: subject({ settlementRegime: "paid" }),
      counter: { kind: "refused", reason: "Cette commande n'est pas réglée." },
    }).run();

    expect(view).toMatchObject({
      refusal: "handover_refused",
      handoverRefusalReason: "Cette commande n'est pas réglée.",
      lines: SHORT_LINES,
    });
  });

  it.each([
    [{ status: "ready" as const }, "not_confirmed"],
    [{ settlementRegime: "due" as const }, "card_unpaid"],
    [{ settlementRegime: "paid" as const, increasePending: true }, "card_increase_pending"],
    [{ voucherDiscountCents: 50 }, "voucher"],
    [{ frozenTerms: [{ amountCents: 200, hasAdjustment: false }] }, "too_old"],
  ])("la décision refuse %o → %s, avant le bac, qui reste montré", async (overrides, refusal) => {
    const view = await scene({ found: subject(overrides) }).run();

    expect(view.refusal).toBe(refusal);
    expect(view.lines).toEqual(SHORT_LINES);
  });

  it.each(["not_drawn", "withdrawn", "sealed", "counted", "nothing_short"] as const)(
    "le colisage refuse « %s » : le code, sans lignes ni décision lue",
    async (refusal) => {
      const { run, decisions } = scene({ bin: { kind: "refused", refusal } });

      expect(await run()).toEqual({
        orderId: "ord_1",
        refusal,
        handoverRefusalReason: null,
        lines: [],
        decision: null,
      });
      expect(decisions.asked).toEqual([]);
    },
  );

  const DECIDED_LINES = [
    {
      sku: "CRO",
      productName: "Croissant",
      saleUnit: "piece",
      due: 3,
      departing: 1,
      notDeparting: 2,
    },
  ];

  it("déjà décidé : qui a validé, quand, et les lignes de la décision (Hugo, 2026-11-03)", async () => {
    const view = await scene({
      found: subject({ decided: true }),
      bin: { kind: "refused", refusal: "already_authorized" },
    }).run();

    expect(view).toEqual({
      orderId: "ord_1",
      refusal: "already_decided",
      handoverRefusalReason: null,
      lines: DECIDED_LINES,
      decision: { decidedAt: DECIDED_AT.toISOString(), decidedByName: "Léa Martin" },
    });
  });

  it("départ autorisé au colisage : la décision aussi", async () => {
    const view = await scene({ bin: { kind: "refused", refusal: "already_authorized" } }).run();

    expect(view.refusal).toBe("already_authorized");
    expect(view.lines).toEqual(DECIDED_LINES);
    expect(view.decision).toEqual({
      decidedAt: DECIDED_AT.toISOString(),
      decidedByName: "Léa Martin",
    });
  });

  it("déjà décidé, auteur hors de l'annuaire : le nom vaut null, jamais inventé", async () => {
    const view = await scene({
      found: subject({ decided: true }),
      decided: { ...DECIDED, decidedBy: "sonde" },
    }).run();

    expect(view.decision).toEqual({ decidedAt: DECIDED_AT.toISOString(), decidedByName: null });
  });

  it("déjà décidé sans décision lisible : l'aperçu reste celui du bac, decision null", async () => {
    const view = await scene({ found: subject({ decided: true }), decided: null }).run();

    expect(view).toMatchObject({ refusal: "already_decided", lines: SHORT_LINES, decision: null });
  });

  it("rien au bac : « nothing_departs », les lignes à zéro montrées", async () => {
    const view = await scene({
      bin: {
        kind: "short",
        lines: [{ sku: "CRO", productName: "Croissant", saleUnit: "piece", due: 3, packed: 0 }],
      },
    }).run();

    expect(view.refusal).toBe("nothing_departs");
    expect(view.lines).toEqual([
      {
        sku: "CRO",
        productName: "Croissant",
        saleUnit: "piece",
        due: 3,
        departing: 0,
        notDeparting: 3,
      },
    ]);
  });

  it("commande inconnue : 404", async () => {
    await expect(scene({ found: null }).run()).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
