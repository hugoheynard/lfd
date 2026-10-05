import type { DetachedUnpaidRow } from "../../ports/detached-unpaid.reader.js";
import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { detachedUnpaidOf } from "../detached-unpaid.js";

/** Dates comparées entre elles seulement, jamais à l'horloge (CLAUDE.md §5). */
const AUGUST = new Date("2026-08-15T08:00:00.000Z");

function row(over: Partial<DetachedUnpaidRow> = {}): DetachedUnpaidRow {
  return {
    orderId: "o1",
    orderNumber: "CMD-1",
    placedAt: AUGUST,
    totalCents: 1_000,
    site: { id: "chalet", name: "Chalet Edelweiss" },
    billedCompanyId: "alpes",
    excludedAt: new Date("2026-10-01T08:00:00.000Z"),
    ...over,
  };
}

const FOLLOW: BillingFollow = {
  companyId: "chalet",
  payerId: "alpes",
  payerName: "Alpes Chalets",
  validFrom: new Date("2026-08-01T00:00:00.000Z"),
  validTo: new Date("2026-09-20T00:00:00.000Z"),
};

describe("detachedUnpaidOf — les impayés d'un site détaché (plan-sous-comptes §2.1 quater)", () => {
  it("les montre au principal qui les réglait, avec le payeur copié", () => {
    expect(detachedUnpaidOf("alpes", [row()], [])).toEqual([{ row: row(), payerId: "alpes" }]);
  });

  it("les montre au site qui les a commandés", () => {
    expect(detachedUnpaidOf("chalet", [row()], [])).toHaveLength(1);
  });

  it("ne les montre à aucune autre société — un frère, un inconnu", () => {
    expect(detachedUnpaidOf("autre", [row()], [])).toEqual([]);
  });

  it("résout à date le payeur d'une commande d'avant S4 (sans payeur copié)", () => {
    const old = row({ billedCompanyId: null });
    expect(detachedUnpaidOf("alpes", [old], [FOLLOW])).toEqual([{ row: old, payerId: "alpes" }]);
  });
});
