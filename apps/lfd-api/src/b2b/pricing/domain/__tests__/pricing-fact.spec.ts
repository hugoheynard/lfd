import { pricingFactOf, type PricingAct } from "../pricing-act.js";

/**
 * **Le miroir d'un acte tarifaire dans le journal général.**
 *
 * La tarification garde son propre journal, plus riche. Ce qui se joue ici est
 * la projection : un écran qui répond à « qui a fait quoi » doit voir la remise
 * consentie sur un prix négocié, sans avoir à connaître la table du domaine.
 *
 * Deux lignes pour un acte, jamais deux vérités : c'est le même écrivain, dans
 * la même transaction. Ce test tient la traduction — pas l'atomicité, qui est
 * celle de `PricingActWriter`.
 */
function act(over: Partial<PricingAct> = {}): PricingAct {
  return {
    subjectType: "rule",
    subjectId: "rule_7",
    kind: "posed",
    actor: "auth0|agent",
    at: new Date("2026-08-25T09:30:00Z"),
    reason: null,
    summary: "−10 % sur la gamme viennoiserie",
    ...over,
  };
}

describe("pricingFactOf", () => {
  it("nomme le fait par le sujet ET le geste", () => {
    expect(pricingFactOf(act()).type).toBe("price_rule.posed");
    expect(pricingFactOf(act({ subjectType: "floor", kind: "archived" })).type).toBe(
      "price_floor.archived",
    );
    expect(pricingFactOf(act({ subjectType: "ladder", kind: "paused" })).type).toBe(
      "volume_ladder.paused",
    );
  });

  /**
   * Le temps de l'acte, pas celui de l'écriture. Un acte daté d'hier écrit
   * aujourd'hui — un rejeu, une reprise — doit se ranger là où il s'est produit.
   */
  it("garde le temps MÉTIER de l'acte", () => {
    expect(pricingFactOf(act()).occurredAt).toEqual(new Date("2026-08-25T09:30:00Z"));
  });

  /**
   * La phrase figée et le motif, et rien d'autre : le détail de la règle vit
   * dans sa table, et l'y recopier ferait du journal une seconde base —
   * désynchronisée par construction.
   */
  it("ne porte que la phrase figée et le motif", () => {
    expect(pricingFactOf(act({ reason: "fin de promotion" })).payload).toEqual({
      summary: "−10 % sur la gamme viennoiserie",
      reason: "fin de promotion",
    });
  });

  it("range le fait sous un sujet qui se filtre", () => {
    const fact = pricingFactOf(act({ subjectType: "ladder", subjectId: "ladder_2" }));
    expect(fact.subjectType).toBe("volume_ladder");
    expect(fact.subjectId).toBe("ladder_2");
  });
});
