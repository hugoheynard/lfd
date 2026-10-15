import { htMillicentsOf } from "@lfd/money";
import { proPriceFromPublic } from "@lfd/pim-contracts";

import { RATIO_TTC_BEFORE_LOT_P } from "./ratio-parity-golden.js";
import { projectGrid } from "./ratio-parity-cases.js";

/**
 * **Aucun prix servi ne change sous `ratio_ttc`** — l'invariant de déploiement
 * du lot P (`plan-catalogue-synchronise-par-audience.md`) : P1 à P4 partent
 * avec la méthode inchangée, et la nouvelle signature de `proPriceOf` ne doit
 * déplacer ni le HT poussé (`projection.ts`) ni le HT émis (`catalog-facts.ts`).
 */
describe("la parité ratio_ttc, avant et après le lot P", () => {
  it("rend, sans prix pro saisi, exactement l'empreinte relevée avant le lot", () => {
    expect(projectGrid(() => null)).toEqual(RATIO_TTC_BEFORE_LOT_P);
  });

  it("ignore un prix pro saisi tant que la méthode est ratio_ttc", () => {
    // Des saisies volontairement fausses : 1 millicentime, puis le prix public.
    expect(projectGrid(() => 1)).toEqual(RATIO_TTC_BEFORE_LOT_P);
    expect(projectGrid((price) => price * 1_000)).toEqual(RATIO_TTC_BEFORE_LOT_P);
  });

  it("rejoue la chaîne d'origine, pas seulement une empreinte", () => {
    for (const [key, [pushed, emitted]] of Object.entries(RATIO_TTC_BEFORE_LOT_P)) {
      const [ratioBp, rate, price] = key.split("|").map(Number) as [number, number, number];
      const expected = htMillicentsOf(proPriceFromPublic(price, ratioBp), rate);
      expect([key, pushed, emitted]).toEqual([key, expected, expected]);
    }
  });
});
