import type { ClientSheet } from "@lfd/contracts";

import { totalRows } from "../order-sheet-pdf-totals.js";
import { LINE, sheet } from "./client-sheet.fixture.js";

/**
 * Le pied du bon public, en TTC (Hugo, 2026-10-09 : « en TTC recalculé »).
 *
 * Régression : les gestes y étaient en HT sous des articles en TTC, et la
 * colonne ne retombait pas sur le total — 124,91 − 11,84 ≠ 112,42.
 */
/** Le point figé par la fixture, sans règle figée (commande antérieure au snapshot). */
const LABO = "Remise retrait Le Labo";

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

    expect(rows.map((row) => row.label)).toEqual(["Articles", LABO, "Total TTC", "dont TVA"]);
    columnAddsUp(rows);
    expect(rows.find((row) => row.label === LABO)?.value).toContain("12,49");
  });

  it("plusieurs gestes : répartis au prorata, le dernier prend le reste au centime", () => {
    const rows = totalRows(
      publicSheet({ discountCents: 1_000, deliveryFeeCents: 500, totalCents: 12_491 - 528 }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Articles",
      LABO,
      "Livraison",
      "Total TTC",
      "dont TVA",
    ]);
    columnAddsUp(rows);
  });

  it("commande composée en TTC : les gestes figés écrits tels quels, sans répartition", () => {
    // 124,91 − 2,10 − 5,00 + 6,00 = 123,81 : la colonne d'un ticket.
    const rows = totalRows(
      publicSheet({
        discountCents: 199,
        voucherDiscountCents: 474,
        deliveryFeeCents: 500,
        totalCents: 12_381,
        ttcTerms: { discountCents: 210, voucherCents: 500, deliveryFeeCents: 600 },
      }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Articles",
      LABO,
      "Bon de fidélité",
      "Livraison",
      "Total TTC",
      "dont TVA",
    ]);
    expect(rows.map((row) => Math.abs(cents(row.value))).slice(1, 4)).toEqual([210, 500, 600]);
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

    expect(rows.map((row) => row.label)).toContain(`${LABO} (HT)`);
    expect(rows.map((row) => row.label)).toContain("Livraison (HT)");
  });
});

describe("la remise de retrait sur ses lignes éligibles (lot C)", () => {
  const BASE = { eligibleHtCents: 10_000, eligibleTtcCents: 10_550, excludedSkus: ["TAS"] };

  it("bon public : « sur X € éligibles » en TTC, et la colonne retombe toujours", () => {
    const rows = totalRows(
      publicSheet({ discountCents: 1_184, totalCents: 11_242, pickupDiscountBase: BASE }),
    );

    const label = rows[1]?.label ?? "";
    expect(label).toMatch(/^Remise retrait Le Labo sur 105,50\s€ éligibles$/u);
    columnAddsUp(rows);
  });

  it("bon pro : l'assiette en HT, même quand un TTC existe", () => {
    const rows = totalRows(sheet({ money: { ...sheet().money, pickupDiscountBase: BASE } }));

    expect(rows.map((row) => row.label)).toContainEqual(
      expect.stringMatching(/^Remise retrait Le Labo sur 100,00\s€ éligibles$/u),
    );
  });

  it("sans ligne exclue, la remise ne dit pas d'assiette", () => {
    const rows = totalRows(sheet());

    expect(rows.map((row) => row.label)).toContain(LABO);
  });
});

/**
 * Régression : le bon disait « Remise » sans dire laquelle (Hugo, 2026-10-25).
 * Le libellé nomme le point de retrait et la règle figés sur la commande.
 */
describe("la remise de retrait se nomme", () => {
  const labels = (money: Partial<ClientSheet["money"]>, fulfillment = sheet().fulfillment) =>
    totalRows(sheet({ fulfillment, money: { ...sheet().money, ...money } })).map(
      (row) => row.label,
    );

  it("un pourcentage figé : « Remise retrait Le Labo (5 %) »", () => {
    expect(labels({ discountAdjustment: { mode: "percent", bp: 500 } })).toContain(
      "Remise retrait Le Labo (5 %)",
    );
  });

  it("un montant figé : « Remise retrait Le Labo (2,00 €) »", () => {
    expect(labels({ discountAdjustment: { mode: "amount", cents: 200 } })).toContainEqual(
      expect.stringMatching(/^Remise retrait Le Labo \(2,00\s€\)$/u),
    );
  });

  it("une ligne exclue : la règle, puis l'assiette", () => {
    expect(
      labels({
        discountAdjustment: { mode: "percent", bp: 1_000 },
        pickupDiscountBase: {
          eligibleHtCents: 10_000,
          eligibleTtcCents: null,
          excludedSkus: ["TAS"],
        },
      }),
    ).toContainEqual(
      expect.stringMatching(/^Remise retrait Le Labo \(10 %\) sur 100,00\s€ éligibles$/u),
    );
  });

  it("un point sans nom figé : « Remise retrait (5 %) »", () => {
    const anonymous = { ...sheet().fulfillment, pickupLabel: null, address: null };

    expect(labels({ discountAdjustment: { mode: "percent", bp: 500 } }, anonymous)).toContain(
      "Remise retrait (5 %)",
    );
  });
});
