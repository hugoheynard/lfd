import type { ClientSheet } from "@lfd/contracts";

import { totalRows } from "../order-sheet-pdf-totals.js";
import { LINE, sheet } from "./client-sheet.fixture.js";

/**
 * Le pied du bon public, en TTC (Hugo, 2026-10-09 : « en TTC recalculé »).
 *
 * Régression : les gestes y étaient en HT sous des articles en TTC, et la
 * colonne ne retombait pas sur le total — 124,91 − 11,84 ≠ 112,42.
 */
const SEALED = { ...LINE, unitPriceTtcCents: 78, lineTotalTtcCents: 12_491 };

function publicSheet(money: Partial<ClientSheet["money"]>): ClientSheet {
  return sheet({
    variant: "public",
    customerPhone: null,
    lines: [SEALED],
    money: { ...sheet().money, vatShares: null, ...money },
  });
}

const cents = (value: string): number =>
  Math.round(Number(value.replace(/[^\d,-]/gu, "").replace(",", ".")) * 100) *
  (value.trim().startsWith("-") || value.includes("−") ? -1 : 1);

function columnAddsUp(rows: ReturnType<typeof totalRows>): void {
  const total = rows.find((row) => row.label === "Total TTC");
  const above = rows.slice(
    0,
    rows.findIndex((row) => row.label === "Total TTC"),
  );
  const sum = above.reduce(
    (acc, row) =>
      acc +
      Math.abs(cents(row.value)) * (row.value.includes("-") || row.value.includes("−") ? -1 : 1),
    0,
  );
  expect(sum).toBe(Math.abs(cents(total?.value ?? "0")));
}

describe("le pied du bon public", () => {
  it("une remise : la colonne retombe sur le Total TTC", () => {
    // 118,40 HT − 11,84 de remise = 106,56 HT → 112,42 TTC à 5,5 %.
    const rows = totalRows(publicSheet({ discountCents: 1_184, totalCents: 11_242 }));

    expect(rows.map((row) => row.label)).toEqual(["Articles", "Remise", "Total TTC", "dont TVA"]);
    columnAddsUp(rows);
    expect(rows.find((row) => row.label === "Remise")?.value).toContain("12,49");
  });

  it("plusieurs gestes : répartis au prorata, le dernier prend le reste au centime", () => {
    const rows = totalRows(
      publicSheet({ discountCents: 1_000, deliveryFeeCents: 500, totalCents: 12_491 - 528 }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Articles",
      "Remise",
      "Livraison",
      "Total TTC",
      "dont TVA",
    ]);
    columnAddsUp(rows);
  });

  it("sans geste : articles, Total TTC, TVA", () => {
    const rows = totalRows(publicSheet({ discountCents: 0, totalCents: 12_491 }));

    expect(rows.map((row) => row.label)).toEqual(["Articles", "Total TTC", "dont TVA"]);
  });

  it("des gestes qui s'annulent en HT restent en HT, et le disent", () => {
    const rows = totalRows(
      publicSheet({ discountCents: 500, deliveryFeeCents: 500, totalCents: 12_491 }),
    );

    expect(rows.map((row) => row.label)).toContain("Remise (HT)");
    expect(rows.map((row) => row.label)).toContain("Livraison (HT)");
  });
});
