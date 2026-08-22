import { lineageSegments } from "../lineage-overlaps.js";
import type { PriceRule, PriceScope } from "../price-rule.js";
import type { VolumeLadder } from "../volume-ladder.js";

/**
 * **Le barème dans la frise.**
 *
 * Il a quitté `price_rules` pour sa propre table, et la frise ne le voyait plus :
 * elle disait donc « rien d'autre ne joue » là où « −20 % sur le catalogue ET
 * −10 % dès 50 » est le cumul le plus banal du modèle.
 *
 * Le fil de ce fichier : un barème n'a PAS un cumul, il en a autant que de
 * paliers — donc la frise annonce les deux bouts, jamais un chiffre unique qui
 * serait faux pour toutes les quantités sauf une.
 */

const day = (iso: string): Date => new Date(`2026-08-${iso}T00:00:00.000Z`);

function promo(id: string, from: string, to: string | null, bp = 2_000): PriceRule {
  return {
    stacksOverMercuriale: false,
    id,
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: day(from),
    validTo: to === null ? null : day(to),
    suspendedFrom: null,
    label: id,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp },
  };
}

function ladder(over: Partial<VolumeLadder> = {}): VolumeLadder {
  return {
    id: "ladder_1",
    scope: { type: "category", id: "viennoiserie" } satisfies PriceScope,
    audience: { type: "all", id: null },
    unit: "percent",
    tiers: [
      { minQuantity: 50, value: 1_000 },
      { minQuantity: 100, value: 2_000 },
    ],
    label: "Barème viennoiserie",
    validFrom: day("01"),
    validTo: day("30"),
    suspendedFrom: null,
    ...over,
  };
}

describe("le barème dans la lignée", () => {
  it("croise la promotion, et compose avec elle", () => {
    const [segment] = lineageSegments([promo("promo", "10", "20")], [ladder()]);

    expect(segment?.kind).toBe("compose");
    expect(segment?.ruleIds).toEqual(["promo", "ladder_1"]);
  });

  /**
   * **La fourchette.** −20 % puis −10 % font −28 % au premier palier ; −20 %
   * puis −20 % font −36 % au dernier. Annoncer l'un des deux seulement mentirait
   * à toutes les autres quantités.
   */
  it("donne le cumul aux DEUX bouts de l’échelle", () => {
    const [segment] = lineageSegments([promo("promo", "10", "20")], [ladder()]);

    expect(segment?.composedBp).toBe(2_800);
    expect(segment?.composedTopBp).toBe(3_600);
  });

  /** Sans barème, le cumul ne dépend pas de la quantité : un seul chiffre. */
  it("garde un chiffre unique quand aucun barème ne compose", () => {
    const [segment] = lineageSegments(
      [promo("a", "01", "20"), { ...promo("b", "10", "30", 1_000), stage: "geste" }],
      [],
    );

    expect(segment?.composedBp).toBe(2_800);
    expect(segment?.composedTopBp).toBe(2_800);
  });

  /** Un barème suspendu n'agit plus : il ne compose avec rien. */
  it("ignore un barème suspendu", () => {
    const segments = lineageSegments(
      [promo("promo", "10", "20")],
      [ladder({ suspendedFrom: day("05") })],
    );

    expect(segments).toEqual([]);
  });

  /** Il porte sa propre fenêtre : hors d’elle, il ne croise plus rien. */
  it("ne croise rien hors de sa fenêtre", () => {
    const segments = lineageSegments(
      [promo("promo", "01", "05")],
      [ladder({ validFrom: day("10") })],
    );

    expect(segments).toEqual([]);
  });

  /**
   * Deux barèmes de niveaux différents partagent l'étage volume : le plus
   * précis évince l'autre, exactement comme deux règles.
   */
  it("laisse le barème de famille évincer celui du catalogue", () => {
    const [segment] = lineageSegments(
      [],
      [ladder({ id: "catalogue", scope: { type: "global", id: null } }), ladder({ id: "famille" })],
    );

    expect(segment?.kind).toBe("supersede");
    expect(segment?.evictedIds).toEqual(["catalogue"]);
  });
});
