import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  MonthlyInvoicesReader,
  type MonthlyInvoicesRead,
} from "../../../domain/ports/monthly-invoices.reader.js";
import { BillingRhythm } from "../../../domain/value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../../domain/value-objects/billing-rhythm-setting.js";
import { FixedRhythms } from "../../commands/__tests__/monthly-invoice-doubles.js";
import { GetMonthlyInvoicesHandler } from "../get-monthly-invoices.handler.js";
import { GetMonthlyInvoicesQuery } from "../get-monthly-invoices.query.js";

/**
 * L'écran « Prélèvement du mois » lit la dernière clôture de l'entité (R3).
 * Horloge FIXE, posée par rapport aux clôtures : aucune date ne se compare
 * au calendrier réel.
 */

const FLOOR = new Date("2026-08-31T22:00:00.000Z");

class RecordingReader extends MonthlyInvoicesReader {
  readonly asked: Date[] = [];
  ofPeriod(_legalEntityId: string, periodClosesAt: Date): Promise<MonthlyInvoicesRead> {
    this.asked.push(periodClosesAt);
    return Promise.resolve({ floorAt: FLOOR, invoices: [], signaled: [], autopilotRun: null });
  }
}

function run(at: Date, setting: BillingRhythmSetting | null = BillingRhythmSetting.initial()) {
  const reader = new RecordingReader();
  const handler = new GetMonthlyInvoicesHandler(
    new FixedRhythms(setting),
    reader,
    new FixedClock(at),
  );
  return { reader, view: handler.execute(new GetMonthlyInvoicesQuery("le_1")) };
}

describe("GetMonthlyInvoices — la dernière clôture de l'entité", () => {
  it("mensuel au 1er : septembre, dès le 30 à 23h55, avec ses bornes et son libellé", async () => {
    const { reader, view } = run(new Date("2026-09-30T21:55:00.000Z"));

    expect(await view).toMatchObject({
      periodClosesAt: "2026-09-30T22:00:00.000Z",
      periodStartsAt: "2026-08-31T22:00:00.000Z",
      periodLabel: "du 1er au 30 septembre 2026",
      issuableFrom: "2026-09-30T21:55:00.000Z",
      open: true,
    });
    expect(reader.asked).toEqual([new Date("2026-09-30T22:00:00.000Z")]);
  });

  it("hebdomadaire au lundi : la semaine qui s'achève le dimanche", async () => {
    const weekly = BillingRhythmSetting.of(BillingRhythm.weekly(1), null);
    const { view } = run(new Date("2026-09-30T08:00:00.000Z"), weekly);

    expect(await view).toMatchObject({
      periodClosesAt: "2026-09-27T22:00:00.000Z",
      periodLabel: "du 21 au 27 septembre 2026",
    });
  });

  it("une période close avant la mise en service n'est pas ouverte", async () => {
    const { view } = run(new Date("2026-08-31T21:55:00.000Z"));

    expect((await view).open).toBe(false);
  });

  it("une entité inconnue : 404", async () => {
    await expect(run(new Date("2026-09-30T21:55:00.000Z"), null).view).rejects.toThrow(
      LegalEntityNotFoundError,
    );
  });
});
