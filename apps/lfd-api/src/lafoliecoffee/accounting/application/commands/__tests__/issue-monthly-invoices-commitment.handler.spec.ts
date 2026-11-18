import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import type { PayerModeSegments } from "../../../domain/ports/payer-billing-modes.reader.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import {
  CREDITOR,
  ENTITY_ID,
  frozenOrder,
  mandate,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { renderFacturXml } from "../../../domain/services/facturx-xml.js";
import {
  invoiceGroupKey,
  type InvoiceableOrder,
} from "../../../domain/services/monthly-invoicing.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { IssueMonthlyInvoicesCommand } from "../issue-monthly-invoices.command.js";
import { IssueMonthlyInvoicesHandler } from "../issue-monthly-invoices.handler.js";
import { meansRow, PayerMeansStore, StorePayersMeansReader } from "./collection-means-doubles.js";
import {
  FakeCancelled,
  FakeMandates,
  FixedBuyers,
  FixedCreditors,
  RecordingRowsLock,
  UlidSequence,
} from "./collection-doubles.js";
import {
  CountingNumbering,
  CurrentCommitments,
  FakeMonthlyReader,
  FixedCommitmentRequirements,
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
  MemoryInvoices,
  MemoryOutcomes,
} from "./monthly-invoice-doubles.js";
import { RecordingDurable } from "./notice-doubles.js";

/**
 * **Une facture par engagement budgétaire** (plan
 * `plan-clients-publics-chorus.md`, § 6 quater, E4′, E4″, E7) — l'émission,
 * ports doublés à la main. Les dates sont le SUJET : l'horloge est fixe et
 * posée par rapport à la clôture demandée.
 */

/** Le 1er octobre 2026 à 00h00, heure de Paris : la clôture de septembre. */
const CLOSURE = "2026-09-30T22:00:00.000Z";
const AFTER_MOMENT = new Date("2026-09-30T21:56:00.000Z");
const FLOOR = new Date("2026-08-31T22:00:00.000Z");
const ARMY_A = { number: "1300012345", serviceCode: "SERV-RH" };
const ARMY_B = { number: "1300067890", serviceCode: "SERV-RH" };

let seq = 0;
function bon(companyId: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  seq += 1;
  const orderNumber = `ORD-P${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `p${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: frozenOrder(orderNumber, placedAt),
    deliveryNoteNumbers: [],
    budgetCommitment: null,
    ...overrides,
  };
}

/** L'armée : un organisme public, au virement depuis août. */
class ArmyBuyers extends StatementBuyerReader {
  async buyersOf(ids: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    const all = await new FixedBuyers().buyersOf(ids);
    return new Map(
      [...all.entries()].map(([id, buyer]) => [
        id,
        id === "c_port" ? { ...buyer, legalForm: "public_state" } : buyer,
      ]),
    );
  }
}

function harness(
  options: {
    readonly army?: boolean;
    readonly payers?: readonly PayerModeSegments[];
    readonly closure?: string;
    readonly at?: Date;
  } = {},
) {
  const invoices = new MemoryInvoices();
  const outcomes = new MemoryOutcomes();
  const reader = new FakeMonthlyReader(invoices, outcomes);
  reader.floorAt = FLOOR;
  const mandates = new FakeMandates();
  mandates.mandates = [mandate("c_port")];
  const means = new PayerMeansStore();
  if (options.army === true) {
    means.rows.push(meansRow("c_port", "bank_transfer", paris("2026-08-01"), ENTITY_ID));
  }
  const clock = new FixedClock(options.at ?? AFTER_MOMENT);
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const issuer = new InvoiceIssuer(
    new CountingNumbering(),
    invoices,
    clock,
    events,
    uow,
    new RecordingDurable(),
  );
  const commitments = new CurrentCommitments(reader);
  const requirements = new FixedCommitmentRequirements();
  const handler = new IssueMonthlyInvoicesHandler(
    reader,
    new FixedModeDates(),
    new FixedPayerModes(options.payers),
    new FixedCreditors(CREDITOR),
    new FixedIssuers([SELLER_FACTS]),
    options.army === true ? new ArmyBuyers() : new FixedBuyers(),
    mandates,
    new StorePayersMeansReader(means),
    issuer,
    outcomes,
    new RecordingRowsLock({ log: [] }),
    new FakeCancelled(),
    commitments,
    requirements,
    new UlidSequence(),
    events,
    clock,
    uow,
  );
  const run = () =>
    handler.execute(new IssueMonthlyInvoicesCommand(ENTITY_ID, options.closure ?? CLOSURE));
  return { reader, invoices, outcomes, commitments, requirements, run };
}

describe("IssueMonthlyInvoices — l'engagement budgétaire (P2)", () => {
  it("trois commandes sur deux engagements : deux factures, deux issues", async () => {
    const h = harness({ army: true });
    const [a1, a2, b1] = [
      bon("c_port", { budgetCommitment: ARMY_A }),
      bon("c_port", { budgetCommitment: ARMY_A }),
      bon("c_port", { budgetCommitment: ARMY_B }),
    ];
    h.reader.orders = [a1, a2, b1];

    const report = await h.run();

    expect(report.issued).toHaveLength(2);
    const states = h.invoices.inserted.map((invoice) => invoice.toState());
    expect(
      states.map((state) => [state.budgetCommitment, state.orders.map((o) => o.orderId)]),
    ).toEqual([
      [ARMY_A, [a1.orderId, a2.orderId]],
      [ARMY_B, [b1.orderId]],
    ]);
    expect(h.outcomes.rows.get(invoiceGroupKey("c_port", null, ARMY_A))?.invoiceId).toBe(
      states[0]?.id,
    );
    expect(h.outcomes.rows.get(invoiceGroupKey("c_port", null, ARMY_B))?.invoiceId).toBe(
      states[1]?.id,
    );
    const second = h.invoices.inserted[1];
    expect(second).toBeDefined();
    const xml = second === undefined ? "" : renderFacturXml(second);
    expect(xml).toContain("<ram:IssuerAssignedID>1300067890</ram:IssuerAssignedID>");
  });

  it("rejouée : les deux factures déjà émises sont sautées", async () => {
    const h = harness({ army: true });
    h.reader.orders = [
      bon("c_port", { budgetCommitment: ARMY_A }),
      bon("c_port", { budgetCommitment: ARMY_B }),
    ];
    await h.run();

    const replay = await h.run();

    expect(replay.issued).toEqual([]);
    expect(h.invoices.inserted).toHaveLength(2);
  });

  /**
   * La course E4″ : l'engagement d'un bon est corrigé entre la préparation
   * et le verrou de l'émission. Relu sous le verrou, le bon sort de la
   * facture de son ancien engagement ; il partira avec celle du nouveau.
   */
  it("un engagement corrigé avant le verrou sort le bon de la facture de l'ancien", async () => {
    const h = harness({ army: true });
    const [kept, moved] = [
      bon("c_port", { budgetCommitment: ARMY_A }),
      bon("c_port", { budgetCommitment: ARMY_A }),
    ];
    h.reader.orders = [kept, moved];
    h.commitments.corrected.set(moved.orderId, ARMY_B);

    await h.run();

    const states = h.invoices.inserted.map((invoice) => invoice.toState());
    expect(states).toHaveLength(1);
    expect(states[0]?.budgetCommitment).toEqual(ARMY_A);
    expect(states[0]?.orders.map((o) => o.orderId)).toEqual([kept.orderId]);
  });

  it("tous les bons corrigés : rien d'émis ni de signalé sous l'ancienne clé", async () => {
    const h = harness({ army: true });
    const moved = bon("c_port", { budgetCommitment: ARMY_A });
    h.reader.orders = [moved];
    h.commitments.corrected.set(moved.orderId, ARMY_B);

    const report = await h.run();

    expect(report.issued).toEqual([]);
    expect(report.blocked).toEqual([]);
  });

  it("le filet E7 : la fiche exige le numéro, le bon n'en a pas — signalé, nommé", async () => {
    const h = harness({ army: true });
    h.requirements.requirements.set("c_port", {
      commitmentRequired: true,
      serviceCodeRequired: false,
    });
    const missing = bon("c_port");
    h.reader.orders = [missing, bon("c_port", { budgetCommitment: ARMY_A })];

    const report = await h.run();

    expect(report.issued).toHaveLength(1);
    expect(report.blocked).toHaveLength(1);
    expect(h.outcomes.rows.get(invoiceGroupKey("c_port", null, null))?.message).toContain(
      `exige le numéro d'engagement sur ses factures (fiche Chorus Pro), et le bon ${missing.orderNumber}`,
    );
  });
});

/** Hebdomadaire et bimensuel depuis le 1er août 2026 (une clôture du mensuel). */
function since(mode: "weekly" | "semimonthly"): readonly PayerModeSegments[] {
  return [
    {
      payerCompanyId: "c_port",
      segments: [{ effectiveFrom: paris("2026-08-01"), mode, writtenAt: paris("2026-08-01") }],
    },
  ];
}

/**
 * Non-régression : un payeur privé, sans engagement, garde la clé et le
 * découpage d'avant P2 — une facture par (payeur, mandat), sous la clé
 * `c_port|m_c_port` — sur les trois rythmes.
 */
describe.each([
  ["mensuel", {}],
  [
    "hebdomadaire",
    {
      payers: since("weekly"),
      closure: "2026-09-27T22:00:00.000Z",
      at: new Date("2026-09-27T21:56:00.000Z"),
    },
  ],
  [
    "bimensuel",
    {
      payers: since("semimonthly"),
      closure: "2026-09-15T22:00:00.000Z",
      at: new Date("2026-09-15T21:56:00.000Z"),
    },
  ],
] as const)("un payeur privé au rythme %s", (_label, options) => {
  it("une seule facture, sous la clé d'avant P2", async () => {
    const h = harness(options);
    const placedAt = new Date("2026-09-14T08:00:00.000Z");
    h.reader.orders = [bon("c_port", { placedAt }), bon("c_port", { placedAt })];

    const report = await h.run();

    expect(report.issued).toHaveLength(1);
    expect([...h.outcomes.rows.keys()]).toEqual(["c_port|m_c_port"]);
    expect(h.invoices.inserted[0]?.toState().budgetCommitment).toBeNull();
    expect(h.invoices.inserted[0]?.toState().orders).toHaveLength(2);
  });
});
