import type { CompanyOrderSummaryView, OrderSummaryCompanyView } from "@lfd/contracts";

import { renderOrderSummaryCsv } from "../order-summary-csv.js";
import { type OrderSummaryPaper, orderSummaryFileName } from "../order-summary-paper.js";
import { renderOrderSummaryPdf } from "../order-summary-pdf.js";
import { LOGO } from "./client-sheet.fixture.js";
import { pdfText } from "./pdf-text.js";

/**
 * Le récapitulatif imprimé et au tableur (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R2) : on
 * LIT ce qui sort, plutôt que d'assurer sur une structure.
 */

// Comparée à rien d'autre qu'elle-même : le rendu n'interroge pas l'horloge.
const GENERATED_AT = new Date("2026-10-21T21:30:00.000Z");

const bottom = {
  subtotalCents: 12_000,
  discountCents: 1_250,
  voucherDiscountCents: 0,
  deliveryFeeCents: 800,
  lateFeeCents: 0,
  vat: [
    { rate: 5.5, amountCents: 550 },
    { rate: 20, amountCents: 300 },
  ],
  unventilatedVatCents: 0,
  totalCents: 12_400,
};

const ordersPretax = { pretaxCents: 11_550, gapCents: -450, cappedDiscountCents: 0 };

function company(id: string, name: string, products: number): OrderSummaryCompanyView {
  return {
    companyId: id,
    name,
    orderCount: 2,
    products: Array.from({ length: products }, (_, index) => ({
      sku: `VIE-${String(index).padStart(3, "0")}`,
      name: `Produit ${String(index)}`,
      quantity: index + 1,
      htCents: 1_000 + index,
    })),
    bottom,
    ordersPretax,
    orders: [
      {
        orderId: `${id}_o1`,
        orderNumber: `ORD-${id}`,
        day: "2026-10-07",
        fulfillmentMethod: "delivery",
        author: { kind: "team" },
        pretaxCents: 11_550,
      },
    ],
  };
}

function paper(over: Partial<CompanyOrderSummaryView> = {}): OrderSummaryPaper {
  const companies = [company("co_1", "Maison mère", 2), company("co_2", "=Site Est", 1)];
  return {
    requesterName: "Café du Port & Fils",
    generatedAt: GENERATED_AT,
    period: null,
    summary: {
      amountsAt: "placement",
      companies,
      total: { orderCount: 4, products: companies[0]?.products ?? [], bottom, ordersPretax },
      excluded: [{ orderId: "o9", orderNumber: "ORD-009", reason: "cancelled" }],
      ...over,
    },
  };
}

describe("le nom du fichier", () => {
  it("dit la société et le jour de PARIS du rendu", () => {
    // 21 h 30 UTC le 21 octobre = 23 h 30 à Paris : encore le 21.
    expect(orderSummaryFileName(paper(), "pdf")).toBe(
      "recapitulatif-cafe-du-port-fils-2026-10-21.pdf",
    );
    expect(
      orderSummaryFileName(
        { ...paper(), generatedAt: new Date("2026-10-21T22:30:00.000Z") },
        "csv",
      ),
    ).toBe("recapitulatif-cafe-du-port-fils-2026-10-22.csv");
  });
});

describe("le récapitulatif en PDF", () => {
  it("porte le titre, la société, la sélection, les tables, le bas et les exclues", async () => {
    const text = pdfText(await renderOrderSummaryPdf(paper(), LOGO));

    for (const expected of [
      "RÉCAPITULATIF DE COMMANDES",
      "Montants à la commande",
      "Café du Port & Fils",
      // `pdfText` décode en latin1 : le tiret cadratin et l'euro (WinAnsi)
      // n'y ressortent pas, on lit autour.
      "Sélection de 5 commandes",
      "4 comptées, 1 exclue",
      "remboursements et avoirs postérieurs non déduits",
      "Maison mère",
      "=Site Est",
      "VIE-001",
      "Sous-total HT",
      "120,00",
      "Remises",
      "- 12,50",
      "Livraison",
      "TVA 5,5 %",
      "TVA 20 %",
      "Total TTC",
      "124,00",
      "Total général",
      "ORD-009",
      "annulée",
      // Les bons en annexe, sur leur page (§10).
      "Page 1/2",
      "Page 2/2",
    ]) {
      expect(text).toContain(expected);
    }
    // Un geste qui n'a pas eu lieu est tu à l'impression.
    expect(text).not.toContain("Bons de fidélité");
    expect(text).not.toContain("non ventilée");
  });

  it("dit la TVA non ventilée quand une commande n'a pas de taux", async () => {
    const summary = paper().summary;
    const unventilated = { ...bottom, vat: [], unventilatedVatCents: 850 };
    const text = pdfText(
      await renderOrderSummaryPdf(
        paper({ total: { ...summary.total, bottom: unventilated } }),
        LOGO,
      ),
    );

    expect(text).toContain("dont TVA non ventilée");
    expect(text).toContain("8,50");
  });

  it("pagine : en-têtes de table répétés et « Page x/N »", async () => {
    const big = company("co_1", "Maison mère", 80);
    const text = pdfText(
      await renderOrderSummaryPdf(paper({ companies: [big], total: big }), LOGO),
    );

    expect(text).toContain("Maison mère (suite)");
    expect(text).toMatch(/Page 2\/(\d+)/u);
    const count = Number(/Page 1\/(\d+)/u.exec(text)?.[1]);
    expect(count).toBeGreaterThan(1);
    expect(text).toContain(`Page ${String(count)}/${String(count)}`);
    // La barre de titres revient sur chaque page de la table.
    expect(text.split("Total HT").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("rend les mêmes octets deux fois", async () => {
    const first = await renderOrderSummaryPdf(paper(), LOGO);
    const second = await renderOrderSummaryPdf(paper(), LOGO);

    expect(first.equals(second)).toBe(true);
  });
});

describe("la période du filtre (§9)", () => {
  const withPeriod = (): OrderSummaryPaper => ({
    ...paper(),
    period: { from: "2026-10-01", to: "2026-10-15" },
  });

  it("le PDF l'imprime en plus de la sélection", async () => {
    const text = pdfText(await renderOrderSummaryPdf(withPeriod(), LOGO));
    expect(text).toContain("Retraits et livraisons du 1er au 15 octobre 2026");
    expect(text).toContain("Sélection de 5 commandes");
  });

  it("le tableur l'écrit sur sa ligne, avant la sélection", () => {
    const csv = renderOrderSummaryCsv(withPeriod());
    expect(csv).toContain('"Retraits et livraisons du 1er au 15 octobre 2026"\r\n"Sélection');
  });

  it("sans période, aucun des deux ne l'invente", async () => {
    expect(renderOrderSummaryCsv(paper())).not.toContain("Retraits et livraisons");
    expect(pdfText(await renderOrderSummaryPdf(paper(), LOGO))).not.toContain(
      "Retraits et livraisons",
    );
  });
});

describe("le récapitulatif au tableur", () => {
  it("ouvre par le BOM, une ligne par (société, produit), puis le bas", () => {
    const csv = renderOrderSummaryCsv(paper());
    const lines = csv.split("\r\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('﻿"Récapitulatif de commandes — montants à la commande"');
    expect(lines).toContain('"Maison mère";"Produit 1";"VIE-001";2;10,01');
    expect(lines).toContain('"Maison mère";"Sous-total HT";"";;120,00');
    // Un montant négatif reste un NOMBRE : pas d'apostrophe.
    expect(lines).toContain('"Maison mère";"Remises";"";;-12,50');
    expect(lines).toContain('"Maison mère";"TVA 5,5 %";"";;5,50');
    expect(lines).toContain('"Total général";"Total TTC";"";;124,00');
    expect(lines).toContain('"ORD-009";"annulée"');
  });

  it("neutralise une société dont le nom commence comme une formule", () => {
    const csv = renderOrderSummaryCsv(paper());

    expect(csv).toContain(`"'=Site Est";"Produit 0"`);
    expect(csv).not.toContain(`"=Site Est"`);
  });

  it("garde toutes les lignes du bas, même à zéro", () => {
    expect(renderOrderSummaryCsv(paper())).toContain('"Maison mère";"Bons de fidélité";"";;0,00');
  });
});
