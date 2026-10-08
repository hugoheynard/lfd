import { b2bMailTemplates } from "../mail-templates.js";

/*
 * L'avis de prélèvement (plan-prelevement-automatique.md, PA2) : le minimum
 * du rulebook (montant, date) et la pratique française (RUM, ICS), plus la
 * raison sociale du créancier et la référence de l'arrêté.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const notice = REGISTRY["customer.collection-notice"];

function render(overrides: Partial<Parameters<typeof notice>[0]> = {}) {
  return notice({
    kind: "notice",
    creditorName: "Crazeativity",
    creditorIdentifier: "FR00ZZZ900001",
    debtorName: "Boulangerie du Port",
    amount: "1 234,56 €",
    collectionDay: "vendredi 16 octobre 2026",
    mandateReference: "RUM-PORT-1",
    statementReference: "01JBQ7Z5K8M3QT9P2X4B000002",
    previous: null,
    ...overrides,
  });
}

describe("le courriel « avis de prélèvement »", () => {
  it("porte créancier, ICS, payeur, montant, date, RUM et référence de l'arrêté", () => {
    const rendered = render();

    expect(rendered.subject).toBe("Avis de prélèvement — Crazeativity · vendredi 16 octobre 2026");
    for (const expected of [
      "Crazeativity",
      "FR00ZZZ900001",
      "Boulangerie du Port",
      "1 234,56 €",
      "vendredi 16 octobre 2026",
      "RUM-PORT-1",
      "01JBQ7Z5K8M3QT9P2X4B000002",
    ]) {
      expect(rendered.html).toContain(expected);
    }
    expect(rendered.attachments).toBeUndefined();
  });

  it("un rectificatif dit qu'il remplace le précédent, et ce que celui-ci annonçait", () => {
    const rendered = render({
      kind: "correction",
      previous: { amount: "1 000,00 €", collectionDay: "jeudi 15 octobre 2026" },
    });

    expect(rendered.subject).toContain("Avis de prélèvement rectifié");
    expect(rendered.html).toContain("Cet avis remplace le précédent.");
    expect(rendered.html).toContain("1 000,00 € le jeudi 15 octobre 2026");
  });

  it("une annulation dit qu'aucune somme ne sera débitée", () => {
    const rendered = render({ kind: "cancellation", statementReference: "" });

    expect(rendered.subject).toContain("Prélèvement annulé");
    expect(rendered.html).toContain("n&#39;aura pas lieu");
    expect(rendered.html).toContain("Aucune somme ne sera débitée");
  });
});
