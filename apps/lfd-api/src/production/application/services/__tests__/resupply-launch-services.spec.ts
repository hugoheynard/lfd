import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import { NOTHING_PENDING, ProductionDay } from "../../../domain/entities/production-day.js";
import { ResupplyToLaunchNotFoundError } from "../../../domain/errors/resupply-launch-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryBatches } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { FixedDayOrders } from "../../__tests__/plan-intake-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import { DayResupplies } from "../../__tests__/settings-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
import { ResupplyLaunchGestures } from "../resupply-launch-gesture.js";
import { ResupplyLaunchReading } from "../resupply-launch-reading.js";
import { ResupplyLaunchRecording } from "../resupply-launch-recording.js";

/**
 * Les trois services du lancement « au plus tôt », chacun seul : le geste
 * (qui, quand), la lecture sous le verrou, l'écriture et le fait. Instants
 * recopiés, jamais comparés à l'horloge murale.
 */
const DAY = ServiceDay.of("2026-09-08");
const EVENING = new Date("2026-09-07T18:00:00.000Z");
const NOW = new Date("2026-09-08T07:30:00.000Z");

const ASAP = {
  resupplyId: "rs_asap",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: null,
  servedByTransfer: true,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" as const }],
};

function resuppliesWithAsap(trace: string[] = []): DayResupplies {
  const resupplies = new DayResupplies([], trace);
  resupplies.asap = [ASAP];
  return resupplies;
}

describe("le geste « Lancer »", () => {
  it("porte l'instant de l'horloge et le nom figé de qui lance", async () => {
    const gestures = new ResupplyLaunchGestures(
      new FixedStaffAuthorDirectory(
        authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
      ),
      new FixedClock(NOW),
    );

    expect(await gestures.of("staff-1")).toEqual({
      at: NOW,
      staffUserId: "staff-1",
      name: "Marie Dupont",
    });
  });

  it("laisse le nom vide quand l'annuaire ne connaît pas la fiche", async () => {
    const gestures = new ResupplyLaunchGestures(
      new FixedStaffAuthorDirectory(),
      new FixedClock(NOW),
    );

    expect((await gestures.of("staff-x")).name).toBeNull();
  });
});

describe("ce que le lancement lit sous le verrou", () => {
  function reading(day: ProductionDay, trace: string[]) {
    return new ResupplyLaunchReading(
      new SavedDays(day, trace),
      resuppliesWithAsap(trace),
      new FixedDayOrders([producibleOrder()], trace),
      new InMemoryWithdrawals(trace),
    );
  }

  it("sur une journée ouverte, lit aussi ce que l'arrêt figerait encore", async () => {
    const trace: string[] = [];

    const subject = await reading(ProductionDay.open(DAY), trace).underLock(DAY, "rs_asap");

    expect(trace).toEqual([
      "load",
      `asap:${DAY.value}:rs_asap`,
      `orders:${DAY.value}`,
      `withdrawals:${DAY.value}`,
      `resupplies:${DAY.value}`,
    ]);
    expect(subject.pending.orders.map((order) => order.orderId)).toEqual(["ord_1"]);
  });

  it("sur une journée arrêtée, ne demande rien de plus au commerce", async () => {
    const trace: string[] = [];
    const closed = ProductionDay.open(DAY);
    closed.close([producibleOrder()], new Set<string>(), EVENING, null);

    const subject = await reading(closed, trace).underLock(DAY, "rs_asap");

    expect(trace).toEqual(["load", `asap:${DAY.value}:rs_asap`]);
    expect(subject.pending).toBe(NOTHING_PENDING);
  });

  it("refuse un réassort que le commerce ne rend pas à lancer", async () => {
    await expect(reading(ProductionDay.open(DAY), []).underLock(DAY, "rs_inconnu")).rejects.toThrow(
      ResupplyToLaunchNotFoundError,
    );
  });
});

describe("écrire un lancement", () => {
  it("écrit les fournées héritées, puis la journée, puis le seul fait du lancement", async () => {
    const trace: string[] = [];
    const durable = new RecordingDurable(trace);
    const recording = new ResupplyLaunchRecording(
      new SavedDays(ProductionDay.open(DAY), trace),
      new InMemoryBatches(trace),
      durable,
    );
    const current = ProductionDay.open(DAY);
    const gesture = { at: NOW, staffUserId: "staff-1", name: "Marie Dupont" };
    const openedPlan = current.launchResupply(ASAP, gesture, NOTHING_PENDING);

    await recording.record({
      day: DAY,
      current,
      resupply: ASAP,
      gesture,
      inherited: [],
      openedPlan,
    });

    // Pas de `production.day_closed` : il enverrait le dossier du jour (Q6).
    expect(trace).toEqual(["save", "publish:production.resupply_launched"]);
    expect(durable.facts[0]?.payload).toMatchObject({ openedPlan: true });
  });
});
