import { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import {
  FixedClosedPlans,
  gateOf,
  RecordingAdmissionDesk,
} from "../../commands/__tests__/plan-doubles.js";

/**
 * L'arrêt du plan et le jour même, lus pour la passation (lot O3,
 * `plan-reglages-commandes.md` §8, §8.1 S5, §8.3). L'horloge de `gateOf` est
 * le 1er janvier 2026 à midi, Paris.
 */

const DAY = "2026-10-15";
const TODAY = "2026-01-01";

describe("OrderPlanGate — l'arrêt du plan", () => {
  it("lit la journée demandée, sans verrou", async () => {
    const plans = new FixedClosedPlans(["2026-10-14"]);

    expect(await gateOf(plans).isClosed(DAY)).toBe(false);
    expect(plans.asked).toEqual([{ from: DAY, to: DAY }]);
  });

  it("dit arrêtée une journée dont le plan l'est", async () => {
    expect(await gateOf(new FixedClosedPlans([DAY])).isClosed(DAY)).toBe(true);
  });

  it("sous le verrou, voit ce que la lecture sans verrou avait manqué", async () => {
    const desk = new RecordingAdmissionDesk([DAY]);
    const gate = gateOf(new FixedClosedPlans(), desk);

    expect(await gate.isClosed(DAY)).toBe(false);
    expect(await gate.hold(DAY)).toBe(true);
    expect(desk.held).toEqual([DAY]);
  });

  it("sans journée demandée, ne lit ni ne verrouille rien", async () => {
    const plans = new FixedClosedPlans([DAY]);
    const desk = new RecordingAdmissionDesk([DAY]);
    const gate = gateOf(plans, desk);

    expect(await gate.isClosed(null)).toBe(false);
    expect(await gate.hold(null)).toBe(false);
    expect(plans.asked).toEqual([]);
    expect(desk.held).toEqual([]);
  });
});

describe("OrderPlanGate — le jour même (réglage)", () => {
  it("fermé par défaut : refuse aujourd'hui, en nommant la journée", async () => {
    await expect(gateOf().ensureNotTooSoon(TODAY)).rejects.toMatchObject({
      code: "orders.same_day_closed",
      fulfillmentDate: TODAY,
    });
  });

  it("refuse a fortiori une journée passée", async () => {
    await expect(gateOf().ensureNotTooSoon("2025-12-31")).rejects.toBeInstanceOf(
      SameDayOrderClosedError,
    );
  });

  it("laisse passer demain", async () => {
    await expect(gateOf().ensureNotTooSoon("2026-01-02")).resolves.toBeUndefined();
  });

  it("ouvert par le réglage : aujourd'hui passe", async () => {
    const gate = gateOf(new FixedClosedPlans(), new RecordingAdmissionDesk(), true);

    await expect(gate.ensureNotTooSoon(TODAY)).resolves.toBeUndefined();
  });
});
