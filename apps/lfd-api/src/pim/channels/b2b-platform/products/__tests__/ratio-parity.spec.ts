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

  // La saisie PRIME, même sous `ratio_ttc` (Hugo, 2026-10-15) : sans saisie,
  // l'empreinte d'avant le lot P tient (cas ci-dessus) ; avec une saisie, les
  // deux chemins du fil portent la saisie, au millicentime.
  it("porte le prix pro saisi sur les deux chemins, même sous ratio_ttc", () => {
    for (const [key, [pushed, emitted]] of Object.entries(projectGrid(() => 853_081))) {
      expect([key, pushed, emitted]).toEqual([key, 853_081, 853_081]);
    }
  });

  it("rejoue la chaîne d'origine, pas seulement une empreinte", () => {
    for (const [key, [pushed, emitted]] of Object.entries(RATIO_TTC_BEFORE_LOT_P)) {
      const [ratioBp, rate, price] = key.split("|").map(Number) as [number, number, number];
      const expected = htMillicentsOf(proPriceFromPublic(price, ratioBp), rate);
      expect([key, pushed, emitted]).toEqual([key, expected, expected]);
    }
  });
});
