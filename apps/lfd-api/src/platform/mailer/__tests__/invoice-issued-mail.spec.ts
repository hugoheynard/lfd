import { b2bMailTemplates } from "../mail-templates.js";

/*
 * « Votre facture FA-… » (plan-emission-de-la-facture.md, E6) : numéro,
 * date, période, TTC, échéance et moyen de paiement ; pas de pièce jointe
 * tant que le PDF/A-3 (E3b) n'existe pas.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const invoice = REGISTRY["customer.invoice-issued"];

function render(overrides: Partial<Parameters<typeof invoice>[0]> = {}) {
  return invoice({
    invoiceNumber: "FA-2026-000007",
    sellerName: "La Folie Douce",
    buyerName: "Boulangerie du Port",
    issuedOn: "mercredi 30 septembre 2026",
    period: "septembre 2026",
    total: "1 234,56 €",
    dueOn: "jeudi 15 octobre 2026",
    paymentMeans: "Prélèvement SEPA — mandat RUM-PORT-1",
    invoicesUrl: "https://boutique.test/mon-compte#compte-invoices",
    ...overrides,
  });
}

describe("le courriel « votre facture »", () => {
  it("porte numéro, date, période, payeur, échéance, règlement, TTC et le lien", () => {
    const rendered = render();

    expect(rendered.subject).toBe("Votre facture FA-2026-000007 — La Folie Douce");
    for (const expected of [
      "FA-2026-000007",
      "mercredi 30 septembre 2026",
      "septembre 2026",
      "Boulangerie du Port",
      "jeudi 15 octobre 2026",
      "RUM-PORT-1",
      "1 234,56 €",
      "https://boutique.test/mon-compte#compte-invoices",
    ]) {
      expect(rendered.html).toContain(expected);
    }
    expect(rendered.attachments).toBeUndefined();
  });

  it("sans origine de boutique, pas de bouton ; sans moyen figé ni période, pas de ligne", () => {
    const rendered = render({ invoicesUrl: "", paymentMeans: null, period: null });

    expect(rendered.html).not.toContain("Voir mes factures");
    expect(rendered.html).not.toContain("Règlement");
    expect(rendered.html).not.toContain("Période");
  });
});
