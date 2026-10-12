import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import {
  LastAutopilotRunReader,
  type AutopilotRunRecord,
} from "../../../domain/ports/last-autopilot-run.reader.js";
import { RecordedClosureReader } from "../../../domain/ports/recorded-closure.reader.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { BillingRhythm } from "../../../domain/value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../../domain/value-objects/billing-rhythm-setting.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { FixedRhythms } from "../../commands/__tests__/monthly-invoice-doubles.js";
import {
  ModeDatesStore,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import { GetLegalEntityHandler } from "../get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "../list-legal-entities.handler.js";
import { GetLegalEntityQuery } from "../legal-entity-queries.js";

/**
 * Le 8 octobre 2026 : le cycle en cours se clôt le 1er novembre à 00h00 de
 * Paris. Les dates ne sont comparées qu'au calendrier calculé — l'horloge est
 * FIXE, jamais le mur.
 */
const NOW = new Date("2026-10-08T09:00:00.000Z");

/** La vue vient du VRAI mapper : un doublé écrit à la main dériverait de la vue servie. */
class OneEntity extends LegalEntityReader {
  constructor(private readonly record: LegalEntityRecord) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([this.record]);
  }
  byId(): Promise<LegalEntityRecord | null> {
    return Promise.resolve(this.record);
  }
}

class NoRun extends LastAutopilotRunReader {
  lastOf(): Promise<AutopilotRunRecord | null> {
    return Promise.resolve(null);
  }
}

/** L'automatisme a tenté le cycle d'octobre : son issue se lit sur la fiche (PA3). */
class OneRun extends LastAutopilotRunReader {
  lastOf(): Promise<AutopilotRunRecord | null> {
    return Promise.resolve({
      cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
      ranAt: new Date("2026-10-01T00:15:00.000Z"),
      outcome: "failed",
      message: "L'entité n'a pas d'ICS.",
    });
  }
}

class NoClosure extends RecordedClosureReader {
  lastClosure(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

/** Mensuel au 1er, passage programmé à l'hebdomadaire du lundi au 1er novembre. */
const SCHEDULED_WEEKLY = BillingRhythmSetting.of(BillingRhythm.default(), {
  rhythm: BillingRhythm.weekly(1),
  effectiveAt: new Date("2026-10-31T23:00:00.000Z"),
});

/** Les dates des modes et les modes des payeurs : vides par défaut — tout est au défaut. */
class Modes {
  readonly dates = new ModeDatesStore();
  readonly payers = new PayerModesStore();
}

function handlerWith(
  rhythms: FixedRhythms,
  modes = new Modes(),
  now: Date = NOW,
): GetLegalEntityHandler {
  return new GetLegalEntityHandler(
    new OneEntity(record()),
    new NoClosure(),
    new NoRun(),
    rhythms,
    new StoreModeDatesReader(modes.dates),
    new StorePayerModesReader(modes.payers),
    new FixedClock(now),
  );
}

function record(): LegalEntityRecord {
  const entity = declaredEntity();
  entity.setCollectionSchedule({
    delayHours: 2,
    daysAfterClosure: null,
    depositCutoff: { businessDaysBefore: 2, time: "16:00" },
  });
  return toView(entity, true);
}

describe("la fiche d'une entité porte le calendrier de son cycle en cours", () => {
  it("échéance reportée au jour ouvré, constitution prévue, date limite de dépôt", async () => {
    const handler = new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      new FixedClock(NOW),
    );

    const view = await handler.execute(new GetLegalEntityQuery("le1"));

    expect(view.nextCollection).toEqual({
      closesAt: "2026-10-31T23:00:00.000Z",
      plannedConstitutionAt: "2026-11-01T01:00:00.000Z",
      // 1er novembre + 14 = dimanche 15 → lundi 16 ; deux jours ouvrés avant : jeudi 12.
      collectionDay: "2026-11-16",
      depositDeadline: { day: "2026-11-12", time: "16:00" },
    });
    expect(view.depositCutoff).toEqual({ businessDaysBefore: 2, time: "16:00" });
  });

  it("la liste porte le même calendrier que la fiche", async () => {
    const reader = new OneEntity(record());
    const clock = new FixedClock(NOW);
    const [listed] = await new ListLegalEntitiesHandler(
      reader,
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      clock,
    ).execute();
    const one = await new GetLegalEntityHandler(
      reader,
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      clock,
    ).execute(new GetLegalEntityQuery("le1"));

    expect(listed?.nextCollection).toEqual(one.nextCollection);
  });

  it("porte la dernière tentative de l'automatisme, issue et message compris", async () => {
    const handler = new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new OneRun(),
      new FixedRhythms(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      new FixedClock(NOW),
    );

    const view = await handler.execute(new GetLegalEntityQuery("le1"));

    expect(view.lastAutopilotRun).toEqual({
      cycleClosesAt: "2026-09-30T22:00:00.000Z",
      ranAt: "2026-10-01T00:15:00.000Z",
      outcome: "failed",
      message: "L'entité n'a pas d'ICS.",
    });
  });

  it("jamais tentée : `null`, pas une tentative inventée", async () => {
    const view = await new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      new FixedClock(NOW),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.lastAutopilotRun).toBeNull();
  });

  it("une entité hebdomadaire du lundi : le calendrier court jusqu'au lundi suivant (R4)", async () => {
    const view = await new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(BillingRhythmSetting.of(BillingRhythm.weekly(1), null)),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      new FixedClock(NOW),
    ).execute(new GetLegalEntityQuery("le1"));

    // Jeudi 8 octobre → lundi 12 octobre 00h00 Paris ; délai de deux heures.
    expect(view.nextCollection).toMatchObject({
      closesAt: "2026-10-11T22:00:00.000Z",
      plannedConstitutionAt: "2026-10-12T00:00:00.000Z",
    });
  });
});

describe("le cycle en cours suit encore le mode mensuel (adaptateur M1)", () => {
  it("un réglage programmé dans l'adaptateur décale la clôture du cycle en cours", async () => {
    const view = await handlerWith(
      new FixedRhythms(SCHEDULED_WEEKLY),
      new Modes(),
      new Date("2026-11-03T09:00:00.000Z"),
    ).execute(new GetLegalEntityQuery("le1"));

    // Lundi 9 novembre 00h00 Paris : l'hebdomadaire a pris effet le 1er.
    expect(view.nextCollection.closesAt).toBe("2026-11-08T23:00:00.000Z");
  });
});

const STAMP = {
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  createdByStaffId: "staff_1",
  cancelledAt: null,
  cancelledByStaffId: null,
};

describe("la fiche porte les dates des trois modes et la dernière clôture (M1, §16)", () => {
  it("rien de réglé : les trois défauts, aucun programmé, aucun verrou, aucun payeur", async () => {
    const view = await handlerWith(new FixedRhythms()).execute(new GetLegalEntityQuery("le1"));

    expect(
      view.billingModes.map((mode) => ({
        mode: mode.mode,
        current: mode.current,
        scheduled: mode.scheduled,
        changeLockedUntil: mode.changeLockedUntil,
        payerCount: mode.payerCount,
      })),
    ).toEqual([
      {
        mode: "monthly",
        current: { days: [1], since: null },
        scheduled: null,
        changeLockedUntil: null,
        payerCount: 0,
      },
      {
        mode: "semimonthly",
        current: { days: [1, 16], since: null },
        scheduled: null,
        changeLockedUntil: null,
        payerCount: 0,
      },
      {
        mode: "weekly",
        current: { days: [1], since: null },
        scheduled: null,
        changeLockedUntil: null,
        payerCount: 0,
      },
    ]);
    // Le 8 octobre, calendrier = le seul mensuel : la dernière clôture est le 1er octobre.
    expect(view.lastClosure).toBe("2026-09-30T22:00:00.000Z");
  });

  it("des dates programmées : le programmé, le verrou jusqu'à la prise d'effet, et les clôtures qui le suivent", async () => {
    const modes = new Modes();
    modes.dates.rows.push({
      ...STAMP,
      id: "d1",
      legalEntityId: "le1",
      mode: "monthly",
      effectiveFrom: new Date("2026-10-31T23:00:00.000Z"),
      rhythm: BillingRhythm.monthly(15),
    });

    const view = await handlerWith(new FixedRhythms(), modes).execute(
      new GetLegalEntityQuery("le1"),
    );
    const monthly = view.billingModes[0];

    expect(monthly?.scheduled).toEqual({ days: [15], effectiveAt: "2026-10-31T23:00:00.000Z" });
    expect(monthly?.changeLockedUntil).toBe("2026-10-31T23:00:00.000Z");
    expect(monthly?.upcomingClosures.map((closure) => closure.periodLabel)).toEqual([
      "du 1er au 31 octobre 2026",
      "du 1er au 14 novembre 2026",
      "du 15 novembre au 14 décembre 2026",
    ]);
  });

  it("un payeur hebdomadaire : compté, et ses lundis entrent dans le calendrier de l'entité", async () => {
    const modes = new Modes();
    modes.payers.rows.push({
      ...STAMP,
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: "cmp_1",
      effectiveFrom: new Date("2026-09-30T22:00:00.000Z"),
      mode: "weekly",
    });

    const view = await handlerWith(new FixedRhythms(), modes).execute(
      new GetLegalEntityQuery("le1"),
    );

    expect(view.billingModes.map((mode) => mode.payerCount)).toEqual([0, 0, 1]);
    // Jeudi 8 octobre : le dernier lundi atteint est le 5 octobre.
    expect(view.lastClosure).toBe("2026-10-04T22:00:00.000Z");
  });
});
