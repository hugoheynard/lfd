import { idempotencyKeySchema } from "@lfd/contracts";

import { scenarioOrderKey } from "../scenario-keys.seed.js";

/**
 * La clé de passation dérivée : c'est elle qui permet à une étape de retrouver,
 * dans une autre requête, la commande que l'étape 0 a posée.
 */
describe("scenarioOrderKey", () => {
  it("rend la même clé pour la même journée, la même file et le même rang", () => {
    expect(scenarioOrderKey("2026-10-05", "counter", 3)).toBe(
      scenarioOrderKey("2026-10-05", "counter", 3),
    );
  });

  it("distingue la journée, la file et le rang", () => {
    const keys = new Set([
      scenarioOrderKey("2026-10-05", "counter", 0),
      scenarioOrderKey("2026-10-06", "counter", 0),
      scenarioOrderKey("2026-10-05", "delivery", 0),
      scenarioOrderKey("2026-10-05", "counter", 1),
    ]);
    expect(keys.size).toBe(4);
  });

  it("est un UUID que le contrat de passation accepte", () => {
    // Sans quoi la passation la refuserait, et l'étape 0 échouerait au premier rang.
    for (let rank = 0; rank < 40; rank += 1) {
      const key = scenarioOrderKey("2026-10-05", rank % 2 === 0 ? "counter" : "delivery", rank);
      expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
    }
  });
});
