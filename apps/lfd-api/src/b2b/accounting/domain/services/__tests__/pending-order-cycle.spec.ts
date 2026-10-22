import { addDays } from "@lfd/contracts";

import type { BillingCycle } from "../billing-cycle.js";
import {
  earliestPendingDay,
  pendingOrderIsInCycle,
  type InvoicingProgress,
} from "../pending-order-cycle.js";

/**
 * ⚠️ Dates absolues, exception prévue du §5 : le module ne lit aucune
 * horloge, il compare des jours entre eux.
 */

/** Minuit à Paris (UTC+2 l'été, UTC+1 l'hiver). */
const SEP_1 = new Date("2026-08-31T22:00:00.000Z");
const OCT_1 = new Date("2026-09-30T22:00:00.000Z");
const NOV_1 = new Date("2026-10-31T23:00:00.000Z");
const DEC_1 = new Date("2026-11-30T23:00:00.000Z");
const JAN_1 = new Date("2026-12-31T23:00:00.000Z");

const SEPTEMBER: BillingCycle = { startsAt: SEP_1, closesAt: OCT_1 };
const OCTOBER: BillingCycle = { startsAt: OCT_1, closesAt: NOV_1 };
const NOVEMBER: BillingCycle = { startsAt: NOV_1, closesAt: DEC_1 };
const DECEMBER: BillingCycle = { startsAt: DEC_1, closesAt: JAN_1 };
const CYCLES = [SEPTEMBER, OCTOBER, NOVEMBER, DECEMBER];

const FLOOR_DAY = "2026-09-01";

function progress(lastRunClosure: Date | null): InvoicingProgress {
  return { floorDay: FLOOR_DAY, lastRunClosure };
}

function cyclesOf(day: string, state: InvoicingProgress): readonly BillingCycle[] {
  return CYCLES.filter((cycle) => pendingOrderIsInCycle(day, cycle, state));
}

describe("pendingOrderIsInCycle — le relevé suit la facture", () => {
  it("avant toute facture : le bon est dans le cycle de sa livraison", () => {
    expect(cyclesOf("2026-10-31", progress(null))).toEqual([OCTOBER]);
  });

  it("octobre pas encore émis : le bon du 31 est en octobre", () => {
    expect(cyclesOf("2026-10-31", progress(OCT_1))).toEqual([OCTOBER]);
  });

  /** La décision de Hugo du 2026-10-22 : là où il sera facturé, et nulle part ailleurs. */
  it("octobre émis, bon du 31 constaté après : il est en novembre seulement", () => {
    expect(cyclesOf("2026-10-31", progress(NOV_1))).toEqual([NOVEMBER]);
  });

  it("une clôture sautée ne le perd pas : il va au premier cycle non émis", () => {
    expect(cyclesOf("2026-09-15", progress(DEC_1))).toEqual([DECEMBER]);
  });

  it("un bon livré dans un cycle non émis reste dans le sien", () => {
    expect(cyclesOf("2026-12-03", progress(NOV_1))).toEqual([DECEMBER]);
  });

  it("un bon livré avant la mise en service reste dans son cycle, jamais facturé", () => {
    const state: InvoicingProgress = { floorDay: "2026-10-01", lastRunClosure: DEC_1 };
    expect(cyclesOf("2026-09-30", state)).toEqual([SEPTEMBER]);
  });

  it("sans mise en service, rien ne se rattrape", () => {
    const state: InvoicingProgress = { floorDay: null, lastRunClosure: NOV_1 };
    expect(cyclesOf("2026-10-31", state)).toEqual([OCTOBER]);
  });

  /**
   * La partition : quel que soit l'état de la facture, un bon non facturé
   * livré avant la dernière clôture est dans UN cycle, ni deux ni aucun.
   */
  it.each([null, SEP_1, OCT_1, NOV_1, DEC_1])(
    "dernière facture passée à %s : chaque jour est dans un seul cycle",
    (lastRun) => {
      for (let day = FLOOR_DAY; day < "2026-12-31"; day = addDays(day, 1)) {
        expect([day, cyclesOf(day, progress(lastRun)).length]).toEqual([day, 1]);
      }
    },
  );
});

describe("earliestPendingDay — la borne de la lecture", () => {
  it("le début du cycle tant que la facture n'y est pas passée", () => {
    expect(earliestPendingDay(NOVEMBER, progress(OCT_1))).toBe("2026-11-01");
  });

  it("le plancher dès qu'elle y est passée : un retard peut venir de loin", () => {
    expect(earliestPendingDay(NOVEMBER, progress(NOV_1))).toBe(FLOOR_DAY);
  });

  it("ne coupe aucun bon que le critère retient", () => {
    for (const lastRun of [null, OCT_1, NOV_1, DEC_1]) {
      for (const cycle of CYCLES) {
        const from = earliestPendingDay(cycle, progress(lastRun));
        for (let day = FLOOR_DAY; day < from; day = addDays(day, 1)) {
          expect(pendingOrderIsInCycle(day, cycle, progress(lastRun))).toBe(false);
        }
      }
    }
  });
});
