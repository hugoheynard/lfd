import { instantToLocal } from "@lfd/contracts";

import { PROVISIONAL_FOOTER, provisionalHeader } from "../provisional-stamp.js";

/**
 * Le bandeau d'une impression provisoire : « Provisoire JJ/MM #n hh:mm ».
 * L'heure attendue se lit par la même conversion de Paris que le rendu, sur
 * un instant dérivé de maintenant : rien n'est comparé à l'horloge.
 */
describe("le bandeau d'une impression provisoire", () => {
  it("dit le jour du lot, le numéro du tirage et l'heure de Paris", () => {
    const printedAt = new Date();
    expect(provisionalHeader("2026-11-26", { run: 4, printedAt })).toBe(
      `Provisoire 26/11 #4 ${instantToLocal(printedAt).time}`,
    );
  });

  it("lit l'heure à Paris, pas en UTC", () => {
    // 10:15 UTC un jour d'hiver : 11:15 à Paris. Une date absolue, comparée
    // à elle-même seulement (exception du § 5).
    const printedAt = new Date("2026-01-15T10:15:00.000Z");
    expect(provisionalHeader("2026-01-16", { run: 1, printedAt })).toBe(
      "Provisoire 16/01 #1 11:15",
    );
  });

  it("dit au pied que le plan n'est pas arrêté", () => {
    expect(PROVISIONAL_FOOTER).toBe("Provisoire — plan non arrêté");
  });
});
