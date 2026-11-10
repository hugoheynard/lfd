import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { RecordedClosureReader } from "../../../domain/ports/recorded-closure.reader.js";
import {
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
  weeklySince2026,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { GetCurrentBillingCycleHandler } from "../get-current-billing-cycle.handler.js";

/** Jeudi 8 octobre 2026, 11h à Paris — horloge FIXE, jamais le mur. */
const NOW = new Date("2026-10-08T09:00:00.000Z");

/** La dernière clôture enregistrée ; retient l'entité demandée. */
class FixedClosure extends RecordedClosureReader {
  readonly asked: (string | null)[] = [];
  constructor(private readonly at: Date | null) {
    super();
  }
  lastClosure(legalEntityId: string | null): Promise<Date | null> {
    this.asked.push(legalEntityId);
    return Promise.resolve(this.at);
  }
}

const handler = (
  closures: FixedClosure,
  payers: FixedPayerModes = new FixedPayerModes(),
): GetCurrentBillingCycleHandler =>
  new GetCurrentBillingCycleHandler(
    new FixedClock(NOW),
    closures,
    new FixedIssuers([SELLER_FACTS]),
    new FixedModeDates(),
    payers,
  );

describe("GetCurrentBillingCycleHandler — sur le calendrier de l'entité en service (M4a)", () => {
  it("mensuel au 1er, aucun lot : le mois civil, la clôture de toutes les entités lue", async () => {
    const closures = new FixedClosure(null);
    const cycle = await handler(closures).execute();

    expect(cycle).toEqual({
      startsAt: "2026-09-30T22:00:00.000Z",
      closesAt: "2026-10-31T23:00:00.000Z",
    });
    expect(closures.asked).toEqual([null]);
  });

  it("un payeur hebdomadaire du lundi : la semaine en cours du calendrier", async () => {
    const cycle = await handler(new FixedClosure(null), weeklySince2026("c_week")).execute();

    expect(cycle).toEqual({
      startsAt: "2026-10-04T22:00:00.000Z",
      closesAt: "2026-10-11T22:00:00.000Z",
    });
  });

  it("borné en bas par la dernière clôture enregistrée quand elle précède la clôture à venir", async () => {
    const recorded = new Date("2026-10-06T22:00:00.000Z");
    const cycle = await handler(new FixedClosure(recorded), weeklySince2026("c_week")).execute();

    expect(cycle.startsAt).toBe(recorded.toISOString());
  });
});
