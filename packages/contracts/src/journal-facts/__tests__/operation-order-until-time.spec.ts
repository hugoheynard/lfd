import { checkJournalFact } from "../index.js";

/**
 * L'heure de clôture se règle par opération avec le calendrier (Hugo,
 * 2026-10-16) : `catalog_operation.rescheduled` porte le réglage, et les faits
 * écrits avant lui — des dates seules — se relisent sans forme ancienne.
 */
describe("catalog_operation.rescheduled et l'heure de clôture", () => {
  it("un fait d'avant le réglage, des dates seules, se relit", () => {
    expect(
      checkJournalFact("catalog_operation.rescheduled", {
        subjectLabel: "Noël 2026",
        changes: {
          orderUntil: { from: "2026-12-21T11:00:00.000Z", to: "2026-12-19T17:00:00.000Z" },
        },
      }),
    ).toBeNull();
  });

  it("le réglage s'écrit, seul ou avec des dates", () => {
    expect(
      checkJournalFact("catalog_operation.rescheduled", {
        subjectLabel: "Noël 2026",
        changes: { showsOrderUntilTime: { from: true, to: false } },
      }),
    ).toBeNull();
  });

  it("un réglage qui n'est pas un booléen est refusé", () => {
    expect(
      checkJournalFact("catalog_operation.rescheduled", {
        subjectLabel: "Noël 2026",
        changes: { showsOrderUntilTime: { from: "oui", to: "non" } },
      }),
    ).toMatchObject({ kind: "invalid_payload" });
  });
});
