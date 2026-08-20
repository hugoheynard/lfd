import type { WebVitalSample } from "@lfd/ops-contract";

import { VitalsStore, VITALS_CAPACITY, VITALS_WINDOW_MS } from "../vitals.store.js";

const NOW = 1_755_600_000_000;

const sample = (value: number, over: Partial<WebVitalSample> = {}): WebVitalSample => ({
  front: "b2b-front",
  metric: "LCP",
  value,
  ...over,
});

describe("VitalsStore — ce que les gens vivent, en ce moment", () => {
  it("ne dit rien tant que personne n'a chargé la page", () => {
    // Un « 0 ms » se lirait comme une page instantanée, soit le contraire d'une
    // absence de mesure.
    expect(new VitalsStore().percentiles("b2b-front", NOW).size).toBe(0);
  });

  it("🔴 rend le 75ᵉ centile, pas la moyenne", () => {
    // Cinq visites rapides et trois lentes : la moyenne dit 1 562 ms, « bon »,
    // pendant que plus d'un quart des gens attend quatre secondes. Le 75ᵉ le
    // dit — c'est pour ça que les Core Web Vitals se lisent là, jamais en
    // moyenne.
    const store = new VitalsStore();
    for (const value of [100, 100, 100, 100, 100, 4000, 4000, 4000]) {
      store.record(sample(value), NOW);
    }

    expect(store.percentiles("b2b-front", NOW).get("LCP")).toBe(4000);
  });

  it("oublie ce qui sort de la fenêtre", () => {
    const store = new VitalsStore();
    store.record(sample(9000), NOW - VITALS_WINDOW_MS - 1);
    store.record(sample(500), NOW);

    expect(store.percentiles("b2b-front", NOW).get("LCP")).toBe(500);
  });

  it("🔴 JETTE une valeur absurde au lieu de la ramener à la borne", () => {
    // Ramener inventerait une mesure plausible là où il n'y en a pas. La route
    // est publique : n'importe qui peut y poster n'importe quoi.
    const store = new VitalsStore();
    store.record(sample(999_999_999), NOW);

    expect(store.percentiles("b2b-front", NOW).size).toBe(0);
  });

  it("refuse une valeur négative ou illisible", () => {
    const store = new VitalsStore();
    store.record(sample(-1), NOW);
    store.record(sample(Number.NaN), NOW);

    expect(store.percentiles("b2b-front", NOW).size).toBe(0);
  });

  it("reste borné quoi qu'on lui envoie", () => {
    // Une file qui grandit sans fin dans un process qui ne redémarre pas est
    // une fuite mémoire déguisée en outil de diagnostic.
    const store = new VitalsStore();
    for (let i = 0; i < VITALS_CAPACITY * 3; i++) {
      store.record(sample(1000 + i), NOW);
    }

    // Seules les dernières sont gardées : le p75 porte sur la fin de la série.
    expect(store.percentiles("b2b-front", NOW).get("LCP")).toBeGreaterThan(1000 + VITALS_CAPACITY);
  });

  it("ne mélange pas deux fronts ni deux mesures", () => {
    const store = new VitalsStore();
    store.record(sample(2000), NOW);
    store.record(sample(50, { front: "b2b-admin-front" }), NOW);
    store.record(sample(0.05, { metric: "CLS" }), NOW);

    expect(store.percentiles("b2b-front", NOW).get("LCP")).toBe(2000);
    expect(store.percentiles("b2b-admin-front", NOW).get("LCP")).toBe(50);
    expect(store.percentiles("b2b-front", NOW).get("CLS")).toBe(0.05);
  });
});
