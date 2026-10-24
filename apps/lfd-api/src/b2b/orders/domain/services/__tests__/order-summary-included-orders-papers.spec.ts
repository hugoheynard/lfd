import { summarizeOrders, type OrderSummarySource } from "../order-summary.js";
import { renderOrderSummaryCsv } from "../order-summary-csv.js";
import type { OrderSummaryPaper } from "../order-summary-paper.js";
import { renderOrderSummaryPdf } from "../order-summary-pdf.js";
import { LOGO } from "./client-sheet.fixture.js";
import { pdfText } from "./pdf-text.js";

/**
 * Les bons inclus, IMPRIMÉS (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §10) — du
 * domaine au texte du PDF et du tableur, sans structure intermédiaire écrite
 * à la main : ce qui sort est ce que le domaine a calculé.
 */

// Comparés à rien d'autre qu'eux-mêmes : le rendu n'interroge pas l'horloge.
const GENERATED_AT = new Date("2026-10-21T08:00:00.000Z");
const PRINCIPAL = "co_principal";

function order(over: Partial<OrderSummarySource> & { readonly id: string }): OrderSummarySource {
  return {
    orderNumber: `CMD-${over.id}`,
    companyId: PRINCIPAL,
    companyName: "Maison mère",
    day: "2026-10-07",
    fulfillmentMethod: "pickup",
    author: { kind: "customer", name: "Léa Martin" },
    cancelled: false,
    paymentStatus: "not_required",
    subtotalCents: 1_000,
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 55,
    vatShares: [{ rate: 5.5, amountCents: 55 }],
    totalCents: 1_055,
    lines: [{ sku: "VIE-001", name: "Croissant", quantity: 10, lineTotalCents: 1_000 }],
    ...over,
  };
}

/** Une commande retirée et une LIVRÉE, frais de port compris. */
const delivered = order({
  id: "livree",
  day: "2026-10-08",
  fulfillmentMethod: "delivery",
  deliveryFeeCents: 750,
  author: { kind: "team" },
  vatCents: 205,
  vatShares: [
    { rate: 5.5, amountCents: 55 },
    { rate: 20, amountCents: 150 },
  ],
  totalCents: 1_955,
});

function paperOf(sources: readonly OrderSummarySource[]): OrderSummaryPaper {
  return {
    summary: summarizeOrders(PRINCIPAL, sources),
    requesterName: "Maison mère",
    generatedAt: GENERATED_AT,
    period: null,
  };
}

describe("une commande livrée dans le récapitulatif", () => {
  it("le bas imprime la ligne « Livraison » et ses frais", async () => {
    const text = pdfText(
      await renderOrderSummaryPdf(paperOf([order({ id: "r" }), delivered]), LOGO),
    );

    expect(text).toContain("Livraison");
    expect(text).toContain("7,50");
  });
});

describe("l'annexe « Confirmations de commande incluses » du PDF", () => {
  it("liste chaque bon : référence, jour, mode, auteur, HT du bon — sans TVA par bon", async () => {
    const text = pdfText(
      await renderOrderSummaryPdf(paperOf([order({ id: "r" }), delivered]), LOGO),
    );
    const annex = text.slice(text.indexOf("CONFIRMATIONS DE COMMANDE INCLUSES"));

    for (const expected of [
      "CMD-r",
      "mer. 7 oct. 2026",
      "Retrait",
      "Léa Martin",
      "10,00",
      "CMD-livree",
      "jeu. 8 oct. 2026",
      "l'équipe",
      "17,50",
      "Total HT des bons",
      "27,50",
      "Écart avec le sous-total HT : livraison",
    ]) {
      expect(annex).toContain(expected);
    }
    expect(annex).not.toContain("TTC");
    expect(annex).not.toContain("TVA 5,5");
  });

  it("répète la barre de titres sur chaque page de la liste", async () => {
    const many = Array.from({ length: 70 }, (_, index) => order({ id: `o${String(index)}` }));
    const text = pdfText(await renderOrderSummaryPdf(paperOf(many), LOGO));
    const annex = text.slice(text.indexOf("CONFIRMATIONS DE COMMANDE INCLUSES"));

    expect(annex).toContain("Maison mère (suite)");
    expect(annex.split("Auteur").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("plusieurs sociétés : un bloc chacune, puis la somme de tous les bons", async () => {
    const text = pdfText(
      await renderOrderSummaryPdf(
        paperOf([
          order({ id: "m" }),
          order({ id: "s", companyId: "co_s", companyName: "Atelier" }),
        ]),
        LOGO,
      ),
    );
    const annex = text.slice(text.indexOf("CONFIRMATIONS DE COMMANDE INCLUSES"));

    expect(annex.indexOf("CMD-m")).toBeLessThan(annex.indexOf("Atelier"));
    expect(annex).toContain("Total HT des bons");
    expect(annex).toContain("total général");
    expect(annex).toContain("20,00");
  });

  it("aucune commande comptée : pas d'annexe", async () => {
    const text = pdfText(
      await renderOrderSummaryPdf(paperOf([order({ id: "x", cancelled: true })]), LOGO),
    );

    expect(text).not.toContain("CONFIRMATIONS DE COMMANDE INCLUSES");
  });
});

describe("le bloc « bons » du tableur", () => {
  it("une ligne par bon, son HT seul, puis la somme et l'écart expliqué", () => {
    const lines = renderOrderSummaryCsv(paperOf([order({ id: "r" }), delivered])).split("\r\n");

    expect(lines).toContain('"Confirmations de commande incluses"');
    expect(lines).toContain(
      '"Confirmation de commande";"Société";"Jour";"Mode";"Auteur";"Montant HT (€)"',
    );
    expect(lines).toContain('"CMD-r";"Maison mère";07/10/2026;"Retrait";"Léa Martin";10,00');
    expect(lines).toContain('"CMD-livree";"Maison mère";08/10/2026;"Livraison";"l\'équipe";17,50');
    expect(lines).toContain('"Total HT des bons";"Maison mère";;"";"";27,50');
    expect(lines).toContain('"Écart avec le sous-total HT : livraison";"Maison mère";;"";"";7,50');
  });

  it("sans écart, aucune ligne d'écart", () => {
    const csv = renderOrderSummaryCsv(paperOf([order({ id: "r" })]));

    expect(csv).toContain('"Total HT des bons";"Maison mère";;"";"";10,00');
    expect(csv).not.toContain("Écart");
  });
});
