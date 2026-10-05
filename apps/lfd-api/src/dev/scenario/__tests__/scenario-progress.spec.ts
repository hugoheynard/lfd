import { reachedStep, type ScenarioFacts, stepViews } from "../scenario-progress.js";

/**
 * La déduction de l'étape atteinte : lue dans les faits de la base, jamais
 * mémorisée — et une étape vraie après une étape fausse ne compte pas.
 */

/** Une journée entièrement jouée : les six étapes sont vraies. */
const COMPLETE: ScenarioFacts = {
  placed: { expected: 23, found: 23, deliveries: 17, pickups: 6 },
  plan: { closed: true, orders: 23 },
  composed: { expected: 15, assigned: 15 },
  production: { items: 12, done: 12 },
  packing: { expected: 17, packed: 17, left: 6 },
  rounds: { rounds: 3, bins: 51, loaded: 51 },
};

/** Les mêmes faits, juste après la remise à l'état de base. */
const PLACED: ScenarioFacts = {
  ...COMPLETE,
  plan: { closed: false, orders: 0 },
  composed: { expected: 15, assigned: 0 },
  production: { items: 0, done: 0 },
  packing: { expected: 17, packed: 0, left: 6 },
  rounds: { rounds: 0, bins: 0, loaded: 0 },
};

describe("reachedStep", () => {
  it("rend 5 quand toute la journée est jouée", () => {
    expect(reachedStep(COMPLETE)).toBe(5);
  });

  it("rend 0 juste après la remise : les commandes sont là, rien d'autre", () => {
    expect(reachedStep(PLACED)).toBe(0);
  });

  it("rend null quand une commande du jour manque — le scénario n'est plus entier", () => {
    expect(reachedStep({ ...COMPLETE, placed: { ...COMPLETE.placed, found: 22 } })).toBeNull();
  });

  it("rend null quand le scénario ne pose rien — jamais « tout est vrai » sur du vide", () => {
    const nothing: ScenarioFacts = {
      ...PLACED,
      placed: { expected: 0, found: 0, deliveries: 0, pickups: 0 },
      packing: { expected: 0, packed: 0, left: 0 },
    };
    expect(reachedStep(nothing)).toBeNull();
  });

  it("s'arrête à la première étape fausse, même si une suivante est vraie", () => {
    // Des bacs chargés sans fournée complète ne font pas « l'étape 5 ».
    const facts = { ...COMPLETE, production: { items: 12, done: 11 } };
    expect(reachedStep(facts)).toBe(2);
  });

  it("ne compte pas une production sans aucun article au compte", () => {
    const facts: ScenarioFacts = {
      ...PLACED,
      plan: { closed: true, orders: 0 },
      composed: { expected: 15, assigned: 15 },
      rounds: { rounds: 3, bins: 0, loaded: 0 },
    };
    expect(reachedStep(facts)).toBe(2);
  });

  it("veut TOUTES les livraisons à router dans une tournée pour l'étape 2", () => {
    expect(reachedStep({ ...COMPLETE, composed: { expected: 15, assigned: 14 } })).toBe(1);
    // Des arrêts sans tournée du jour n'existent pas : zéro tournée, pas d'étape 2.
    expect(reachedStep({ ...COMPLETE, rounds: { rounds: 0, bins: 0, loaded: 0 } })).toBe(1);
  });

  it("veut TOUS les bacs chargés pour l'étape 5", () => {
    expect(reachedStep({ ...COMPLETE, rounds: { rounds: 3, bins: 51, loaded: 50 } })).toBe(4);
    expect(reachedStep({ ...COMPLETE, rounds: { rounds: 3, bins: 0, loaded: 0 } })).toBe(4);
  });

  it("veut TOUTES les commandes prévues fermées au colisage pour l'étape 4", () => {
    expect(reachedStep({ ...COMPLETE, packing: { expected: 17, packed: 16, left: 6 } })).toBe(3);
  });
});

describe("stepViews", () => {
  it("coche les étapes jusqu'à l'étape atteinte, et pas au-delà", () => {
    expect(stepViews(PLACED).map((view) => [view.step, view.reached])).toEqual([
      [0, true],
      [1, false],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
    ]);
  });

  it("résume chaque étape par ce que la base porte", () => {
    expect(stepViews(COMPLETE).map((view) => view.summary)).toEqual([
      "23 sur 23 commandes du jour — 17 livraisons, 6 retraits au comptoir",
      "plan arrêté, 23 commandes au plan",
      "3 tournées, 15 sur 15 livraisons placées",
      "12 sur 12 articles sortis du four",
      "17 sur 17 commandes prêtes, 6 laissée(s) hors colisage",
      "3 tournées, 51 sur 51 bacs chargés",
    ]);
  });

  it("dit le plan ouvert, et accorde le singulier", () => {
    const facts: ScenarioFacts = {
      ...PLACED,
      placed: { expected: 2, found: 2, deliveries: 1, pickups: 1 },
      rounds: { rounds: 1, bins: 1, loaded: 0 },
    };
    const summaries = stepViews(facts).map((view) => view.summary);
    expect(summaries[0]).toBe("2 sur 2 commandes du jour — 1 livraison, 1 retrait au comptoir");
    expect(summaries[1]).toBe("plan du jour pas encore arrêté");
    expect(summaries[2]).toBe("1 tournée, 0 sur 15 livraisons placées");
    expect(summaries[5]).toBe("1 tournée, 0 sur 1 bac chargé");
  });
});
