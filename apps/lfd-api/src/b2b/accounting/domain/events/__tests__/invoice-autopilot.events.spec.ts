import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import { InvoiceAutopilotRanEvent, InvoiceSignalledEvent } from "../invoice-autopilot.events.js";

/**
 * Les deux faits du passage de la facture du mois (plan `facture-emise.md`,
 * puce « Journal »). L'instant n'est comparé qu'à lui-même : il est absolu.
 */
const AT = new Date("2026-09-30T21:55:00.000Z");

/** Septembre 2026 à Paris — comparé à aucune horloge. */
const SEPTEMBER = {
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
};

/** Une semaine d'un payeur hebdomadaire, close le lundi 12 octobre 2026. */
const WEEK = {
  startsAt: new Date("2026-10-04T22:00:00.000Z"),
  closesAt: new Date("2026-10-11T22:00:00.000Z"),
};

describe("le fait « passage automatique de la facture du mois »", () => {
  it("a pour sujet l'entité émettrice, nommée, avec le mois, l'issue et les deux nombres", () => {
    const fact = new InvoiceAutopilotRanEvent(
      { id: "le_1", name: "La Folie Douce SAS" },
      SEPTEMBER,
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
        periodClosesAt: "2026-09-30T22:00:00.000Z",
        periodLabel: "du 1er au 30 septembre 2026",
        outcome: "issued",
        issuedCount: 3,
        signalledCount: 1,
        message: "1 payeur(s) signalé(s)",
      },
    });
    expect(JOURNAL_FACTS["invoice.autopilot_ran"].payload.safeParse(fact.payload).success).toBe(
      true,
    );
  });
});

describe("le fait « payeur signalé »", () => {
  it("a pour sujet le payeur, nommé ; charge : SA période et la raison, aucun montant", () => {
    const fact = new InvoiceSignalledEvent(
      { id: "c_port", name: "Café du Port" },
      WEEK,
      "SIREN manquant",
      AT,
    ).journalFact();

    expect(fact).toEqual({
      type: "invoice.signalled",
      subjectType: "company",
      subjectId: "c_port",
      occurredAt: AT,
      payload: {
        subjectLabel: "Café du Port",
        month: "2026-10",
        periodClosesAt: "2026-10-11T22:00:00.000Z",
        periodLabel: "du 5 au 11 octobre 2026",
        reason: "SIREN manquant",
      },
    });
    expect(JOURNAL_FACTS["invoice.signalled"].payload.safeParse(fact.payload).success).toBe(true);
  });
});
