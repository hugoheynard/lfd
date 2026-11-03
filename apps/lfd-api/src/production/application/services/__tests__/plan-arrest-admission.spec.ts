import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { PlanClosedBeforeOrderCutoffError } from "../../../domain/errors/production-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { CloseProductionDayCommand } from "../../commands/close-production-day.command.js";
import { admissionOf, FixedStatus, SilentSweeper } from "../../__tests__/plan-intake-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import { CutoffRules } from "../../__tests__/settings-doubles.js";

/**
 * `PlanArrestAdmission` — ce que l'arrêt fait avant le verrou, et la seule
 * décision qu'il reprend sous lui. `NOW` est 20:00 à Paris la veille de
 * `DAY`, comparé à `FixedClock` seulement.
 */
const NOW = new Date("2026-09-07T18:00:00.000Z");
const DAY = ServiceDay.of("2026-09-08");
/** L'arrêt du plan de `DAY` tombe à 23:00 la veille : après `NOW`. */
const LATE_CUTOFF = () => new CutoffRules([{ daysBefore: 1, time: "23:00", graceMinutes: 0 }]);

function scene(closed: boolean, cutoffs: CutoffRules = new CutoffRules()) {
  const trace: string[] = [];
  const admission = admissionOf({
    days: new SavedDays(ProductionDay.open(DAY)),
    clock: new FixedClock(NOW),
    status: new FixedStatus(closed, trace),
    cutoffs,
    sweeper: new SilentSweeper(trace),
    authors: new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
    ),
  });
  return { admission, trace };
}

describe("admettre un arrêt du plan, avant le verrou", () => {
  it("refuse un arrêt anticipé d'une journée vue ouverte, avant même de balayer", async () => {
    const { admission, trace } = scene(false, LATE_CUTOFF());

    await expect(
      admission.beforeLock(DAY, new CloseProductionDayCommand(DAY.value, "manual", "staff-1")),
    ).rejects.toThrow(PlanClosedBeforeOrderCutoffError);
    expect(trace).toEqual(["status"]);
  });

  it("laisse passer une journée vue arrêtée avant l'heure, balaie, et garde l'heure limite pour le verrou", async () => {
    const { admission, trace } = scene(true, LATE_CUTOFF());

    const admitted = await admission.beforeLock(DAY, new CloseProductionDayCommand(DAY.value));

    expect(trace).toEqual(["status", `sweep:${DAY.value}`]);
    expect(admitted.stop?.cause).toBe("general");
  });

  it("fige le nom de qui arrête à la main", async () => {
    const { admission } = scene(false);

    const admitted = await admission.beforeLock(
      DAY,
      new CloseProductionDayCommand(DAY.value, "manual", "staff-1"),
    );

    expect(admitted.signer).toEqual({
      kind: "staff",
      staffUserId: "staff-1",
      name: "Marie Dupont",
    });
  });

  it("signe « automatiquement » le tour automatique, et laisse anonyme un arrêt sans fiche", async () => {
    const { admission } = scene(false);

    const automatic = await admission.beforeLock(
      DAY,
      new CloseProductionDayCommand(DAY.value, "automatic"),
    );
    const anonymous = await admission.beforeLock(DAY, new CloseProductionDayCommand(DAY.value));

    expect(automatic.signer).toEqual({ kind: "automatic" });
    expect(anonymous.signer).toBeNull();
  });
});

describe("la décision reprise sous le verrou", () => {
  it("refuse avant l'heure limite, quel que soit l'en-tête lu avant le verrou", async () => {
    const { admission } = scene(true, LATE_CUTOFF());
    const admitted = await admission.beforeLock(DAY, new CloseProductionDayCommand(DAY.value));

    expect(() => {
      admission.refuseUnderLock(DAY, admitted);
    }).toThrow(PlanClosedBeforeOrderCutoffError);
  });

  it("laisse passer sans heure limite posée", async () => {
    const { admission } = scene(true);
    const admitted = await admission.beforeLock(DAY, new CloseProductionDayCommand(DAY.value));

    expect(() => {
      admission.refuseUnderLock(DAY, admitted);
    }).not.toThrow();
  });
});
