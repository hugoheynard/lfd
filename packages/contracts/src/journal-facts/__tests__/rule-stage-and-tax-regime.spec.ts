import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Le TODO des phrases du journal (2026-09-19), côté catalogue : l'étage d'une
 * règle devient une donnée, et les taux de TVA d'avant le renommage en
 * « taux » retrouvent leur entrée.
 */

function readable(type: JournalFactType, line: unknown): boolean {
  return journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
}

describe("price_rule.* — l'étage, en donnée structurée", () => {
  const lotB = { subjectLabel: "Noël", summary: "Geste « Noël » · −10 %", reason: null };

  it("s'écrit avec l'étage de la règle", () => {
    expect(checkJournalFact("price_rule.posed", { ...lotB, stage: "geste" })).toBeNull();
    expect(
      checkJournalFact("price_rule.archived", {
        ...lotB,
        stage: "mercuriale",
        audience: { id: "cmp_1", name: "Club Med" },
      }),
    ).toBeNull();
  });

  it("refuse un étage que le calcul ne connaît pas", () => {
    expect(checkJournalFact("price_rule.posed", { ...lotB, stage: "Geste" })).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("garde lisible la forme du lot B, sans étage, mais ne l'écrit plus", () => {
    expect(readable("price_rule.paused", lotB)).toBe(true);
    expect(checkJournalFact("price_rule.paused", lotB)).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("ne donne pas d'étage aux autres actes tarifaires", () => {
    expect(
      checkJournalFact("price_floor.posed", {
        subjectLabel: "tout le catalogue",
        summary: "mur à 1,20 €",
        reason: null,
        stage: "geste",
      }),
    ).toMatchObject({ kind: "invalid_payload" });
  });
});

/**
 * Régression : deux lignes `tax_regime.rate_changed` du 2026-08-21, en base de
 * dev, s'affichaient comme un fait inconnu — le type avait été renommé le jour
 * même sans migration (`d4849851`).
 */
describe("tax_regime.* — retirés, et lisibles", () => {
  const tagged = { name: "Réduit", percent: 5.5, tag: "tva-5-5" };
  const bare = { name: "Réduit", percent: 5.5 };
  const rateChanged = {
    name: "Réduit",
    from: 5.5,
    to: 10,
    blast: { familiesEmporter: 2, familiesSurPlace: 0 },
  };

  it.each([
    ["tax_regime.created", tagged],
    ["tax_regime.created", bare],
    ["tax_regime.deleted", tagged],
    ["tax_regime.deleted", bare],
    ["tax_regime.rate_changed", { ...rateChanged, tag: "tva-10" }],
    ["tax_regime.rate_changed", rateChanged],
    ["tax_regime.renamed", { from: "Réduit", to: "Taux réduit" }],
  ] as const)("%s se lit sous la forme %j", (type, line) => {
    expect(readable(type, line)).toBe(true);
  });

  it("ne s'écrit plus", () => {
    expect(checkJournalFact("tax_regime.created", bare)).toMatchObject({ kind: "retired_type" });
  });

  it("ne lit pas une clé que ces charges n'ont jamais portée", () => {
    expect(readable("tax_regime.created", { ...bare, subjectLabel: "Réduit" })).toBe(false);
  });
});

/**
 * `delivery_availability.updated` dit, pour chaque clientèle, l'avant et
 * l'après : ce qui a été ouvert ou fermé se déduit de la charge seule
 * (vérifié le 2026-09-19 — le réglage n'a pas de date à lui, l'instant est
 * celui de la ligne).
 */
describe("delivery_availability.updated — l'avant et l'après de chaque clientèle", () => {
  it("s'écrit avec les deux cases et leur état remplacé", () => {
    expect(
      checkJournalFact("delivery_availability.updated", {
        openToB2b: true,
        openToB2c: false,
        previous: { openToB2b: true, openToB2c: true },
      }),
    ).toBeNull();
  });
});
