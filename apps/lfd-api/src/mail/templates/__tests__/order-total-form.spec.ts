import type { SettlementRegime } from "@lfd/contracts";

import { orderTotalFormOf, totalIsPretaxOnly } from "../order-total-form.js";
import { sheet } from "./rendering-golden/order-cases.js";

function sheetOf(variant: "pro" | "public", settlement: SettlementRegime) {
  const base = sheet({ variant });
  return { ...base, money: { ...base.money, settlement } };
}

/**
 * Comment un e-mail de commande écrit un total (Hugo, 2026-11-10) : le HT
 * seul d'un pro au compte (F5), le TTC puis le HT d'un pro qui paie par
 * carte, le TTC seul d'un particulier.
 */
describe("orderTotalFormOf", () => {
  it.each([
    ["pro", "account", "pretax"],
    ["pro", "paid", "both"],
    ["pro", "due", "both"],
    ["pro", "free", "both"],
    ["public", "paid", "with_tax"],
    ["public", "due", "with_tax"],
    ["public", "free", "with_tax"],
  ] as const)("%s réglé %s → %s", (variant, settlement, form) => {
    expect(orderTotalFormOf(sheetOf(variant, settlement))).toBe(form);
  });

  it("la règle F5 est celle de la confirmation : au compte, et lui seul", () => {
    expect(totalIsPretaxOnly(sheetOf("pro", "account"))).toBe(true);
    expect(totalIsPretaxOnly(sheetOf("pro", "paid"))).toBe(false);
  });
});
