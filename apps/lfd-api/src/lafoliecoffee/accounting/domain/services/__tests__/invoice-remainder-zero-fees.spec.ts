import { simulateInvoiceDossier } from "../invoice-dossier.js";
import { frozenBon, goodsLine } from "./per-order-cycle-fixtures.js";

/**
 * **La facture ne montre pas le port à 0 € d'un reste** (décision de Hugo du
 * 2026-10-26, `documentation/commandes/bon-de-livraison.md`).
 *
 * Un reste porte un port, une surtaxe et une remise fixe à zéro
 * (`remainderAdjustmentsOf`). Sur la facture, un bon dont ces montants sont
 * nuls ne fait naître ni ligne de livraison ni frais : aucune « Frais de
 * livraison 0,00 € » à côté du port payé sur le premier envoi. Les remises
 * à zéro de la ventilation par taux sont structurelles ; le Factur-X les
 * écarte (`facturx-settlement.ts`, filtre `amountCents !== 0`, vérifié le
 * 2026-10-26).
 */
describe("la facture — les gestes à zéro d'un reste", () => {
  it("un bon sans port ni surtaxe : aucune ligne de livraison, aucun frais", () => {
    const remainder = frozenBon({
      reference: "ORD-9",
      lines: [goodsLine("PAI", 5.5, 2_000)],
      deliveryFeeCents: 0,
    });

    const { invoice } = simulateInvoiceDossier([remainder]);

    expect(invoice.deliveries).toEqual([]);
    expect(invoice.lateFeeCents).toBe(0);
    expect(invoice.vat.categories.flatMap((category) => category.charges)).toEqual([]);
  });

  it("le port payé sur le premier envoi reste, seul, à son montant", () => {
    const first = frozenBon({
      reference: "ORD-9",
      lines: [goodsLine("PAI", 5.5, 2_000)],
      deliveryFeeCents: 1_200,
    });

    const { invoice } = simulateInvoiceDossier([first]);

    expect(invoice.deliveries.map((line) => line.amountCents)).toEqual([1_200]);
  });
});
