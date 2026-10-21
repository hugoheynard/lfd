import {
  settlementOf,
  type InvoiceDebitFact,
  type InvoiceSettlementFacts,
} from "../invoice-settlement.js";

// Dates comparées entre elles seulement : jamais à l'horloge.
const facts = (over: Partial<InvoiceSettlementFacts> = {}): InvoiceSettlementFacts => ({
  isCreditNote: false,
  paidOn: null,
  dueOn: "2026-10-14",
  debits: [],
  blocked: false,
  ...over,
});

const debit = (over: Partial<InvoiceDebitFact> = {}): InvoiceDebitFact => ({
  batchId: "01B",
  batchStatus: "constituted",
  constitutedAt: new Date("2026-10-02T08:00:00.000Z"),
  requestedCollectionDay: "2026-10-09",
  noticeCollectionDay: "2026-10-08",
  returnResolution: null,
  returnedOn: null,
  invoiceCountOnDebit: 1,
  ...over,
});

describe("le statut de règlement d'une facture (§7.1)", () => {
  it("1. un avoir n'a pas de statut, même payé ou prélevé", () => {
    expect(
      settlementOf(facts({ isCreditNote: true, paidOn: "2026-10-01", debits: [debit()] })),
    ).toBeNull();
  });

  it("2. payée par carte : acquittée à son jour, avant tout lot", () => {
    expect(settlementOf(facts({ paidOn: "2026-10-01", debits: [debit()], blocked: true }))).toEqual(
      { status: "card_paid", date: "2026-10-01", otherInvoicesOnDebit: 0 },
    );
  });

  it("3. lot constitué : prélèvement prévu à l'échéance du lot", () => {
    expect(settlementOf(facts({ debits: [debit()] }))).toEqual({
      status: "collection_planned",
      date: "2026-10-09",
      otherInvoicesOnDebit: 0,
    });
  });

  it("3. lot déposé sans retour : prélevée à l'échéance du lot", () => {
    expect(settlementOf(facts({ debits: [debit({ batchStatus: "deposited" })] }))?.status).toBe(
      "collected",
    );
  });

  it("3. un lot d'avant l'échéance figée se replie sur le jour de l'avis", () => {
    const old = debit({ batchStatus: "deposited", requestedCollectionDay: null });
    expect(settlementOf(facts({ debits: [old] }))?.date).toBe("2026-10-08");
    const bare = debit({ requestedCollectionDay: null, noticeCollectionDay: null });
    expect(settlementOf(facts({ debits: [bare] }))?.date).toBeNull();
  });

  it("3. retour à traiter : rejetée au jour du retour, avec les autres factures de la ligne", () => {
    const rejected = debit({
      batchStatus: "deposited",
      returnResolution: "pending",
      returnedOn: "2026-10-12",
      invoiceCountOnDebit: 3,
    });
    expect(settlementOf(facts({ debits: [rejected] }))).toEqual({
      status: "collection_rejected",
      date: "2026-10-12",
      otherInvoicesOnDebit: 2,
    });
  });

  it.each([
    ["represented", "recollection_planned"],
    ["settled_otherwise", "settled"],
    ["written_off", "closed"],
  ] as const)("3. retour %s → %s, sans date", (resolution, status) => {
    const returned = debit({
      batchStatus: "deposited",
      returnResolution: resolution,
      returnedOn: "2026-10-12",
    });
    expect(settlementOf(facts({ debits: [returned] }))).toEqual({
      status,
      date: null,
      otherInvoicesOnDebit: 0,
    });
  });

  it("3. re-présentée puis reprise par un lot : c'est la DERNIÈRE ligne qui dit l'état", () => {
    const first = debit({
      batchId: "01A",
      batchStatus: "deposited",
      constitutedAt: new Date("2026-10-02T08:00:00.000Z"),
      returnResolution: "represented",
    });
    const retry = debit({
      batchId: "01C",
      constitutedAt: new Date("2026-11-02T08:00:00.000Z"),
      requestedCollectionDay: "2026-11-09",
    });
    expect(settlementOf(facts({ debits: [retry, first] }))).toMatchObject({
      status: "collection_planned",
      date: "2026-11-09",
    });
  });

  it("3. un lot annulé APRÈS le lot déposé ne compte pas : il relâche ses factures", () => {
    const deposited = debit({ batchId: "01A", batchStatus: "deposited" });
    const cancelled = debit({
      batchId: "01C",
      batchStatus: "cancelled",
      constitutedAt: new Date("2026-11-02T08:00:00.000Z"),
    });
    expect(settlementOf(facts({ debits: [deposited, cancelled] }))?.status).toBe("collected");
  });

  it("3. à instant égal, le lot d'id le plus grand l'emporte (ULID)", () => {
    const a = debit({ batchId: "01A", batchStatus: "deposited" });
    const b = debit({ batchId: "01B" });
    expect(settlementOf(facts({ debits: [b, a] }))?.status).toBe("collection_planned");
    expect(settlementOf(facts({ debits: [a, b] }))?.status).toBe("collection_planned");
  });

  it("4. aucune ligne : prévue à l'échéance de la facture", () => {
    expect(settlementOf(facts())).toEqual({
      status: "collection_planned",
      date: "2026-10-14",
      otherInvoicesOnDebit: 0,
    });
  });

  it("4. seuls des lots annulés : comme aucune ligne", () => {
    const cancelled = debit({ batchStatus: "cancelled" });
    expect(settlementOf(facts({ debits: [cancelled] }))?.status).toBe("collection_planned");
  });

  it("4. bloquée sans ligne vivante : en cours de traitement, sans date", () => {
    expect(settlementOf(facts({ blocked: true }))).toEqual({
      status: "processing",
      date: null,
      otherInvoicesOnDebit: 0,
    });
    const cancelled = debit({ batchStatus: "cancelled" });
    expect(settlementOf(facts({ blocked: true, debits: [cancelled] }))?.status).toBe("processing");
  });

  it("3 avant 4 : une ligne vivante l'emporte sur des bons qui ont quitté `due`", () => {
    // Un lot déposé passe ses bons à `collected` : ils ne sont plus `due`.
    expect(
      settlementOf(facts({ blocked: true, debits: [debit({ batchStatus: "deposited" })] }))?.status,
    ).toBe("collected");
  });
});
