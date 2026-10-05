import type { CycleOrder } from "../../ports/cycle-orders.reader.js";
import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { payerStatement, type PayerStatementInput } from "../payer-statement.js";

/** Dates comparées entre elles seulement, jamais à l'horloge (CLAUDE.md §5). */
const FOLLOW_STARTS = new Date("2026-09-10T00:00:00.000Z");
const DETACHED_AT = new Date("2026-09-20T00:00:00.000Z");
const BEFORE = new Date("2026-09-05T08:00:00.000Z");
const DURING = new Date("2026-09-15T08:00:00.000Z");
const AFTER = new Date("2026-09-25T08:00:00.000Z");

let seq = 0;

function order(companyId: string, siteName: string, placedAt: Date, cents: number): CycleOrder {
  seq += 1;
  const vat = Math.round(cents * 0.055);
  return {
    id: `o${String(seq)}`,
    orderNumber: `CMD-${String(seq)}`,
    placedAt,
    companyId,
    siteName,
    subtotalCents: cents,
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: vat,
    vatShares: [{ rate: 5.5, amountCents: vat }],
    totalCents: cents + vat,
    collectionState: "due",
  };
}

function follow(companyId: string, validTo: Date | null): BillingFollow {
  return {
    companyId,
    payerId: "alpes",
    payerName: "Alpes Chalets",
    validFrom: FOLLOW_STARTS,
    validTo,
  };
}

const OWN = order("alpes", "Alpes Chalets", BEFORE, 10_000);
const ARO_BEFORE = order("arolle", "Chalet Arolle", BEFORE, 1_000);
const ARO_DURING = order("arolle", "Chalet Arolle", DURING, 2_000);
const EDEL_DURING = order("edelweiss", "Chalet Edelweiss", DURING, 3_000);
const EDEL_AFTER = order("edelweiss", "Chalet Edelweiss", AFTER, 4_000);

const INPUT: PayerStatementInput = {
  payerId: "alpes",
  payerLabel: "Alpes Chalets",
  orders: [OWN, ARO_BEFORE, ARO_DURING, EDEL_DURING, EDEL_AFTER],
  // Arolle suit depuis le 10 ; Edelweiss suivait du 10 au 20, puis détaché.
  followsTowardsPayer: [follow("arolle", null), follow("edelweiss", DETACHED_AT)],
  followsOfPayer: [],
};

describe("payerStatement", () => {
  it("met le payeur d'abord, puis un groupe par site, par nom", () => {
    const { groups } = payerStatement(INPUT);
    expect(groups.map((group) => [group.label, group.ownOrders])).toEqual([
      ["Alpes Chalets", true],
      ["Chalet Arolle", false],
      ["Chalet Edelweiss", false],
    ]);
  });

  it("n'attribue au payeur que les commandes d'un site passées PENDANT le suivi", () => {
    const { groups } = payerStatement(INPUT);
    expect(groups.map((group) => group.lines.map((line) => line.id))).toEqual([
      [OWN.id],
      // commande d'avant le début du suivi : réglée par le site, hors relevé
      [ARO_DURING.id],
      // site détaché le 20 : la commande d'avant reste, celle d'après sort
      [EDEL_DURING.id],
    ]);
  });

  it("totalise le relevé comme la somme de ses groupes, au centime", () => {
    const statement = payerStatement(INPUT);
    const sum = (pick: (totals: (typeof statement)["totals"]) => number): number =>
      statement.groups.reduce((total, group) => total + pick(group.totals), 0);
    expect(statement.totals.totalCents).toBe(sum((totals) => totals.totalCents));
    expect(statement.totals.vatCents).toBe(sum((totals) => totals.vatCents));
    expect(statement.totals.orderCount).toBe(3);
    expect(statement.totals.vatByRate).toEqual([
      { rate: 5.5, amountCents: sum((totals) => totals.vatByRate[0]?.amountCents ?? 0) },
    ]);
  });

  it("garde un groupe vide pour le payeur sans commande propre", () => {
    const { groups } = payerStatement({ ...INPUT, orders: [ARO_DURING] });
    expect(groups[0]).toMatchObject({ ownOrders: true, lines: [] });
    expect(groups[0]?.totals.totalCents).toBe(0);
  });

  it("nomme qui règle, sur le relevé d'un site, les commandes passées pendant son suivi", () => {
    const statement = payerStatement({
      payerId: "arolle",
      payerLabel: "Chalet Arolle",
      orders: [ARO_BEFORE, ARO_DURING],
      followsTowardsPayer: [],
      followsOfPayer: [follow("arolle", null)],
    });
    expect(statement.groups).toHaveLength(1);
    expect(statement.lines.map((line) => line.paidBy)).toEqual([
      null,
      { companyId: "alpes", name: "Alpes Chalets" },
    ]);
  });
});
