import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Les contextes de vente ont perdu les deux réglages de l'ancien canal de vente
 * en ligne le 2026-10-16, et la migration `20261016210000_le_canal_retire_efface`
 * les a EFFACÉS des faits passés (ordre de Hugo). Une ligne ainsi nettoyée doit
 * se relire sous la forme courante — avec ou sans `subjectLabel`, selon qu'elle
 * a été écrite avant ou après les libellés — et une clé de canal ne s'écrit plus.
 */

function readable(type: JournalFactType, line: unknown): boolean {
  return journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
}

describe("sales_context.* après l'effacement de l'ancien canal", () => {
  it("une ligne .created nettoyée se relit, avec ou sans libellé", () => {
    const cleaned = { key: "traiteur", label: "Traiteur", active: true };

    expect(readable("sales_context.created", cleaned)).toBe(true);
    expect(readable("sales_context.created", { subjectLabel: "Traiteur", ...cleaned })).toBe(true);
  });

  it("une ligne .updated nettoyée se relit, avec ou sans libellé", () => {
    const cleaned = { changes: { active: { from: false, to: true } } };

    expect(readable("sales_context.updated", cleaned)).toBe(true);
    expect(readable("sales_context.updated", { subjectLabel: "Traiteur", ...cleaned })).toBe(true);
  });

  it("une clé de l'ancien canal ne se relit ni ne s'écrit plus", () => {
    const stale = {
      subjectLabel: "Traiteur",
      key: "traiteur",
      label: "Traiteur",
      active: true,
      projectedToFormerChannel: true,
    };

    expect(readable("sales_context.created", stale)).toBe(false);
    expect(checkJournalFact("sales_context.created", stale)).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("la forme courante s'écrit", () => {
    expect(
      checkJournalFact("sales_context.updated", {
        subjectLabel: "Traiteur",
        changes: { label: { from: "Traiteur", to: "Service traiteur" } },
      }),
    ).toBeNull();
  });
});
