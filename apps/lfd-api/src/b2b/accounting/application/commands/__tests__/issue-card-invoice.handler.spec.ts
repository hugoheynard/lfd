import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import type { CardInvoiceCandidate } from "../../../domain/services/card-invoicing.js";
import { frozenOrder } from "../../../domain/services/__tests__/collection-fixtures.js";
import { IssueCardInvoiceCommand } from "../issue-card-invoice.command.js";
import { ReconcileRefundsCommand } from "../reconcile-refunds.command.js";
import { cardWorld } from "./card-invoice-doubles.js";

/**
 * **La facture carte** (lot E5a) et l'avoir qui la suit (E5b) —
 * l'orchestration, ports doublés à la main. Les instants sont le SUJET : ils
 * ne sont comparés qu'entre eux et à l'horloge FIXE du monde, jamais au
 * calendrier réel.
 */

/** Le 30 septembre 2026 à 14h, heure de Paris. */
const RETRAIT = new Date("2026-09-30T12:00:00.000Z");
/** Le 1er octobre à 00h30, heure de Paris — un rejeu après minuit. */
const AFTER_MIDNIGHT = new Date("2026-09-30T22:30:00.000Z");
const PAID = new Date("2026-09-29T09:00:00.000Z");

function order(overrides: Partial<CardInvoiceCandidate> = {}): CardInvoiceCandidate {
  return {
    orderId: "o_1",
    orderNumber: "CMD-001",
    companyId: "c_port",
    billedCompanyId: null,
    placedAt: PAID,
    clientele: "pro",
    cancelled: false,
    paymentStatus: "paid",
    totalCents: 1_000,
    paidAt: PAID,
    handedOverAt: RETRAIT,
    invoiced: false,
    refundedCents: 0,
    follows: [],
    frozen: frozenOrder("CMD-001", PAID),
    ...overrides,
  };
}

const issue = (w: ReturnType<typeof cardWorld>) =>
  w.handler.execute(new IssueCardInvoiceCommand("o_1"));

describe("IssueCardInvoiceHandler — les deux ordres d'arrivée", () => {
  it("retrait puis paiement : rien au retrait, la facture au paiement", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ paymentStatus: "pending", paidAt: null }));

    expect((await issue(w)).outcome).toBe("awaiting_payment");
    w.reader.orders.set("o_1", order());
    const paid = await issue(w);

    expect(paid).toMatchObject({ outcome: "issued", number: "FA-2026-000001" });
    expect(w.invoices.inserted).toHaveLength(1);
  });

  it("paiement puis retrait : rien au paiement, la facture au retrait", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ handedOverAt: null }));

    expect((await issue(w)).outcome).toBe("awaiting_handover");
    w.reader.orders.set("o_1", order());

    expect((await issue(w)).outcome).toBe("issued");
  });

  it("la facture est acquittée, datée du jour d'émission, livrée le jour du retrait", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order());
    await issue(w);
    const state = w.invoices.inserted[0]?.toState();

    expect(state).toMatchObject({
      issuedOn: "2026-09-30",
      dueOn: "2026-09-30",
      paymentMeans: { code: "48" },
      prepayment: { amountCents: 1_000, paidOn: "2026-09-29" },
      orders: [{ orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-30" }],
    });
    expect(state?.buyer.companyId).toBe("c_port");
    expect(w.outcomes.rows.get("o_1")?.invoiceId).toBe(state?.id);
    expect(w.lock.locked).toEqual(["o_1"]);
  });

  it("l'acheteur est le payeur légal copié sur la commande, pas le site", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ companyId: "c_chalet", billedCompanyId: "c_principal" }));
    await issue(w);

    expect(w.invoices.inserted[0]?.toState().buyer.companyId).toBe("c_principal");
  });
});

describe("IssueCardInvoiceHandler — idempotence et chronologie", () => {
  it("le second déclencheur ne facture pas deux fois", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order());
    await issue(w);

    expect((await issue(w)).outcome).toBe("already_invoiced");
    expect(w.invoices.inserted).toHaveLength(1);
    expect(w.numbering.taken).toEqual(["FA-2026-000001"]);
  });

  it("un rejeu après minuit est daté du jour réel, sans heurter le dernier jour émis", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_other", { ...order(), orderId: "o_other", orderNumber: "CMD-002" });
    await w.handler.execute(new IssueCardInvoiceCommand("o_other"));
    w.clock.set(AFTER_MIDNIGHT);
    w.reader.orders.set("o_1", order());

    expect((await issue(w)).outcome).toBe("issued");
    expect(w.invoices.inserted[1]?.toState()).toMatchObject({
      issuedOn: "2026-10-01",
      orders: [{ deliveredOn: "2026-09-30" }],
    });
  });
});

describe("IssueCardInvoiceHandler — rien ne boucle", () => {
  it("une facture impossible est signalée, rangée et journalisée, sans lever ni prendre de numéro", async () => {
    const w = cardWorld(RETRAIT, []);
    w.reader.orders.set("o_1", order());

    const result = await issue(w);

    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("La facture ne peut pas être émise");
    expect(w.numbering.taken).toEqual([]);
    expect(w.outcomes.rows.get("o_1")).toMatchObject({ invoiceId: null });
    expect(w.journal.types()).toEqual(["order.card_invoice_blocked"]);
  });

  it("« Réessayer » une fois l'émetteur en service émet la facture", async () => {
    const blocked = cardWorld(RETRAIT, []);
    blocked.reader.orders.set("o_1", order());
    await issue(blocked);
    const fixed = cardWorld(RETRAIT, [SELLER_FACTS]);
    fixed.reader.orders.set("o_1", order());

    expect((await issue(fixed)).outcome).toBe("issued");
  });

  it("un TTC recalculé qui ne tombe pas sur l'encaissé est signalé, pas facturé", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ totalCents: 1_001 }));

    expect((await issue(w)).outcome).toBe("blocked");
    expect(w.invoices.inserted).toEqual([]);
  });
});

describe("IssueCardInvoiceHandler — les remboursements (A10, E5b)", () => {
  it("remboursée en totalité avant le retrait : pas de facture", async () => {
    const w = cardWorld(RETRAIT);
    w.refunds.add("o_1", "r_1", 1_000);
    w.reader.orders.set("o_1", order({ paymentStatus: "refunded" }));

    expect((await issue(w)).outcome).toBe("fully_refunded");
    expect(w.invoices.inserted).toEqual([]);
  });

  it("remboursée en partie avant le retrait : la facture sur le total, puis l'avoir aussitôt", async () => {
    const w = cardWorld(RETRAIT);
    w.refunds.add("o_1", "r_1", 300);
    w.reader.orders.set("o_1", order());
    await issue(w);

    const [invoice, note] = w.invoices.inserted;
    expect(invoice?.totalTtcCents).toBe(1_000);
    expect(note?.isCreditNote).toBe(true);
    expect(note?.totalTtcCents).toBe(300);
    expect(w.refunds.rows[0]?.creditNoteId).toBe(note?.id);
  });

  it("un partiel puis le reste : deux avoirs dont la somme égale la facture", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order());
    await issue(w);
    w.refunds.add("o_1", "r_1", 333);
    await w.reconcile.execute(new ReconcileRefundsCommand("o_1"));
    w.refunds.add("o_1", "r_2", 667);
    await w.reconcile.execute(new ReconcileRefundsCommand("o_1"));
    await w.reconcile.execute(new ReconcileRefundsCommand("o_1"));

    const notes = w.invoices.inserted.filter((piece) => piece.isCreditNote);
    expect(notes.map((note) => note.totalTtcCents)).toEqual([333, 667]);
    expect(notes.reduce((sum, note) => sum + note.totalHtCents, 0)).toBe(
      w.invoices.inserted[0]?.totalHtCents,
    );
  });
});
