import { InvoiceAutopilotRanEvent, InvoiceSignalledEvent } from "../invoice-autopilot.events.js";

/**
 * Les deux faits du passage de la facture du mois (plan `facture-emise.md`,
 * puce « Journal »). L'instant n'est comparé qu'à lui-même : il est absolu.
 */
const AT = new Date("2026-09-30T21:55:00.000Z");

describe("le fait « passage automatique de la facture du mois »", () => {
  it("a pour sujet l'entité émettrice, nommée, avec le mois, l'issue et les deux nombres", () => {
    const fact = new InvoiceAutopilotRanEvent(
      { id: "le_1", name: "La Folie Douce SAS" },
      "2026-09",
      { outcome: "issued", issuedCount: 3, signalledCount: 1, message: "1 payeur(s) signalé(s)" },
      AT,
    ).journalFact();

    expect(fact).toEqual({
      type: "invoice.autopilot_ran",
      subjectType: "legal_entity",
      subjectId: "le_1",
      occurredAt: AT,
      payload: {
        subjectLabel: "La Folie Douce SAS",
        month: "2026-09",
        outcome: "issued",
        issuedCount: 3,
        signalledCount: 1,
        message: "1 payeur(s) signalé(s)",
      },
    });
  });
});

describe("le fait « payeur signalé »", () => {
  it("a pour sujet le payeur, nommé ; charge : le mois et la raison, aucun montant", () => {
    const fact = new InvoiceSignalledEvent(
      { id: "c_port", name: "Café du Port" },
      "2026-09",
      "SIREN manquant",
      AT,
    ).journalFact();

    expect(fact).toEqual({
      type: "invoice.signalled",
      subjectType: "company",
      subjectId: "c_port",
      occurredAt: AT,
      payload: { subjectLabel: "Café du Port", month: "2026-09", reason: "SIREN manquant" },
    });
  });
});
