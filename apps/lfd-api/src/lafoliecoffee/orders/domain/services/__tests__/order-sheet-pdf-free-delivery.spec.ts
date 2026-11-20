import type { ClientSheet } from "@lfd/contracts";

import { totalRows } from "../order-sheet-pdf-totals.js";
import { FREE_DELIVERY_LABEL } from "../order-sheet-pdf-free-delivery.js";
import { LINE, sheet } from "./client-sheet.fixture.js";

/**
 * La livraison offerte sur le bon (doc `frais-et-livraison-offerte.md` et
 * § 2.8) : « Livraison » au barème, puis « Livraison offerte » ou le libellé
 * de la promotion au même montant, négatif — affichée, jamais comptée : le
 * total et la répartition des gestes n'en bougent pas.
 */
const SEALED = { ...LINE, unitPriceTtcCents: 78, lineTotalTtcCents: 12_491 };
const LOYAL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

function paper(variant: ClientSheet["variant"], money: Partial<ClientSheet["money"]>): ClientSheet {
  return sheet({
    variant,
    customerPhone: null,
    lines: [SEALED],
    money: { ...sheet().money, vatShares: null, deliveryFeeCents: 0, ...money },
  });
}

const labels = (rows: ReturnType<typeof totalRows>): readonly string[] =>
  rows.map((row) => row.label);

describe("la livraison offerte sur le bon pro", () => {
  it("offerte par le franco : le barème, puis « Livraison offerte » au même montant", () => {
    const rows = totalRows(
      paper("pro", { freeDelivery: { waivedCents: 2_400, waivedTtcCents: null } }),
    );

    const at = labels(rows).indexOf("Livraison");
    expect(labels(rows).slice(at, at + 2)).toEqual(["Livraison", FREE_DELIVERY_LABEL]);
    expect(rows[at]?.value).toContain("24,00");
    expect(rows[at + 1]?.value).toMatch(/^[-−]\s?24,00/u);
  });

  it("offerte par une promotion : elle se nomme par son libellé figé", () => {
    const rows = totalRows(
      paper("pro", { freeDelivery: { waivedCents: 2_400, waivedTtcCents: null, label: LOYAL } }),
    );

    expect(labels(rows)).toContain("Client fidèle");
    expect(labels(rows)).not.toContain(FREE_DELIVERY_LABEL);
  });

  it("le total HT ne bouge pas d'un centime", () => {
    const without = totalRows(paper("pro", {}));
    const offered = totalRows(
      paper("pro", { freeDelivery: { waivedCents: 2_400, waivedTtcCents: null } }),
    );
    const pretax = (rows: ReturnType<typeof totalRows>): string | undefined =>
      rows.find((row) => row.label === "Total avant TVA" || row.label === "Total HT")?.value;

    expect(pretax(offered)).toBe(pretax(without));
  });

  it("rien d'offert : aucune ligne de livraison", () => {
    expect(labels(totalRows(paper("pro", {})))).not.toContain("Livraison");
  });
});

describe("la livraison offerte sur le bon public", () => {
  it("le TTC figé, hors de la répartition des gestes : la remise garde sa part", () => {
    const base = { discountCents: 1_184, totalCents: 11_242 };
    const without = totalRows(paper("public", base));
    const offered = totalRows(
      paper("public", { ...base, freeDelivery: { waivedCents: 2_000, waivedTtcCents: 2_400 } }),
    );

    expect(offered.filter((row) => !row.label.startsWith("Livraison"))).toEqual(without);
    expect(offered.find((row) => row.label === FREE_DELIVERY_LABEL)?.value).toMatch(
      /^[-−]\s?24,00/u,
    );
  });

  it("sans TTC figé : le HT, et il le dit", () => {
    const rows = totalRows(
      paper("public", {
        totalCents: 12_491,
        freeDelivery: { waivedCents: 2_000, waivedTtcCents: null },
      }),
    );

    expect(labels(rows)).toEqual(
      expect.arrayContaining(["Livraison (HT)", `${FREE_DELIVERY_LABEL} (HT)`]),
    );
  });
});
