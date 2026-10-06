import { planArrestedBellsOf } from "../delivery.purge.js";

/**
 * Régression : la purge ne vidait pas `delivery_day_readiness` ni la cloche
 * « plan arrêté » — à chaque remise, l'ensemble grandissait et la cloche
 * resonnait (« 17 nouvelles livraisons », staff_notifications 14 → 16).
 */
describe("planArrestedBellsOf", () => {
  it("vise la cloche « plan arrêté » de chaque journée du scénario, jour borné par `:`", () => {
    expect(planArrestedBellsOf(["2026-10-05", "2026-10-06"])).toEqual({
      OR: [
        { idempotencyKey: { startsWith: "notification:delivery.plan_arrested:2026-10-05:" } },
        { idempotencyKey: { startsWith: "notification:delivery.plan_arrested:2026-10-06:" } },
      ],
    });
  });

  it("ne vise rien sans journée", () => {
    expect(planArrestedBellsOf([])).toEqual({ OR: [] });
  });
});
