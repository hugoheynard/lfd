import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import {
  LastAutopilotRunReader,
  type AutopilotRunRecord,
} from "../../../domain/ports/last-autopilot-run.reader.js";
import { InvoicedClosuresReader } from "../../../domain/ports/invoiced-closures.reader.js";
import { RecordedClosureReader } from "../../../domain/ports/recorded-closure.reader.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { BillingRhythm } from "../../../domain/value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../../domain/value-objects/billing-rhythm-setting.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { FixedRhythms } from "../../commands/__tests__/monthly-invoice-doubles.js";
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

/** La facture a tenté les clôtures données, et elles seules. */
class NoInvoicedClosure extends InvoicedClosuresReader {
  constructor(private readonly attemptedAt: readonly string[] = []) {
    super();
  }
  attempted(_legalEntityId: string, periodClosesAt: Date): Promise<boolean> {
    return Promise.resolve(this.attemptedAt.includes(periodClosesAt.toISOString()));
  }
}

/** Mensuel au 1er, passage programmé à l'hebdomadaire du lundi au 1er novembre. */
const SCHEDULED_WEEKLY = BillingRhythmSetting.of(BillingRhythm.default(), {
  rhythm: BillingRhythm.weekly(1),
  effectiveAt: new Date("2026-10-31T23:00:00.000Z"),
});

function handlerWith(
  rhythms: FixedRhythms,
  invoiced: InvoicedClosuresReader,
  now: Date = NOW,
): GetLegalEntityHandler {
  return new GetLegalEntityHandler(
    new OneEntity(record()),
    new NoClosure(),
    new NoRun(),
    rhythms,
    invoiced,
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
      new NoInvoicedClosure(),
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
      new NoInvoicedClosure(),
      clock,
    ).execute();
    const one = await new GetLegalEntityHandler(
      reader,
      new NoClosure(),
      new NoRun(),
      new FixedRhythms(),
      new NoInvoicedClosure(),
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
      new NoInvoicedClosure(),
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
      new NoInvoicedClosure(),
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
      new NoInvoicedClosure(),
      new FixedClock(NOW),
    ).execute(new GetLegalEntityQuery("le1"));

    // Jeudi 8 octobre → lundi 12 octobre 00h00 Paris ; délai de deux heures.
    expect(view.nextCollection).toMatchObject({
      closesAt: "2026-10-11T22:00:00.000Z",
      plannedConstitutionAt: "2026-10-12T00:00:00.000Z",
    });
  });
});

describe("la fiche annonce les prochaines clôtures (R5)", () => {
  it("les trois prochaines, au rythme de l'entité, avec leur période et le jour de leur facture", async () => {
    const view = await handlerWith(
      new FixedRhythms(BillingRhythmSetting.of(BillingRhythm.weekly(1), null)),
      new NoInvoicedClosure(),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.upcomingClosures).toEqual([
      {
        closesAt: "2026-10-11T22:00:00.000Z",
        periodLabel: "du 5 au 11 octobre 2026",
        invoicedOn: "2026-10-11",
      },
      {
        closesAt: "2026-10-18T22:00:00.000Z",
        periodLabel: "du 12 au 18 octobre 2026",
        invoicedOn: "2026-10-18",
      },
      {
        closesAt: "2026-10-25T23:00:00.000Z",
        periodLabel: "du 19 au 25 octobre 2026",
        invoicedOn: "2026-10-25",
      },
    ]);
  });

  it("suivent le rythme programmé dès sa prise d'effet", async () => {
    const view = await handlerWith(
      new FixedRhythms(SCHEDULED_WEEKLY),
      new NoInvoicedClosure(),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.upcomingClosures.map((closure) => closure.periodLabel)).toEqual([
      "du 1er au 31 octobre 2026",
      "du 1er au 1er novembre 2026",
      "du 2 au 8 novembre 2026",
    ]);
  });
});

describe("la fiche dit AVANT le geste qu'un changement de rythme attend sa facture (§12)", () => {
  it("rien de programmé : aucun verrou", async () => {
    const view = await handlerWith(new FixedRhythms(), new NoInvoicedClosure()).execute(
      new GetLegalEntityQuery("le1"),
    );
    expect(view.billingRhythmChangeLock).toBeNull();
  });

  it("programmé, prise d'effet pas atteinte : verrouillé, la facture qui libère, et l'annulation possible", async () => {
    const view = await handlerWith(
      new FixedRhythms(SCHEDULED_WEEKLY),
      new NoInvoicedClosure(),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingRhythmChangeLock).toEqual({
      effectiveAt: "2026-10-31T23:00:00.000Z",
      unlocksAfterInvoiceOn: "2026-10-31",
      canCancel: true,
    });
  });

  it("prise d'effet passée, facture pas encore tentée : toujours verrouillé, plus d'annulation", async () => {
    const view = await handlerWith(
      new FixedRhythms(SCHEDULED_WEEKLY),
      new NoInvoicedClosure(),
      new Date("2026-11-03T09:00:00.000Z"),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingRhythmChangeLock).toMatchObject({ canCancel: false });
  });

  it("la clôture de prise d'effet tentée par la facture : le verrou tombe", async () => {
    const view = await handlerWith(
      new FixedRhythms(SCHEDULED_WEEKLY),
      new NoInvoicedClosure(["2026-10-31T23:00:00.000Z"]),
      new Date("2026-11-03T09:00:00.000Z"),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingRhythmChangeLock).toBeNull();
  });
});
