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
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import {
  ModeDatesStore,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import type { CountedPayersReaders } from "../../counted-payers-support.js";
import { activePayer, clientsOf, countingOf, signedMandate } from "./counted-payers-doubles.js";
import { GetLegalEntityHandler } from "../get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "../list-legal-entities.handler.js";
import { GetLegalEntityQuery } from "../legal-entity-queries.js";

/**
 * Le 8 octobre 2026 : le cycle en cours se clôt le 1er novembre à 00h00 de
 * Paris. Les dates ne sont comparées qu'au calendrier calculé — l'horloge est
 * FIXE, jamais le mur.
 */
const NOW = new Date("2026-10-08T09:00:00.000Z");

/** Les payeurs des cas ci-dessous, tous comptés (actifs, mandat signé chez `le1`). */
const CLIENTS = clientsOf("le1", ["cmp_1"]);

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

/** Les dates des modes et les modes des payeurs : vides par défaut — tout est au défaut. */
class Modes {
  readonly dates = new ModeDatesStore();
  readonly payers = new PayerModesStore();
}

function handlerWith(
  modes = new Modes(),
  now: Date = NOW,
  counting: CountedPayersReaders = CLIENTS,
): GetLegalEntityHandler {
  return new GetLegalEntityHandler(
    new OneEntity(record()),
    new NoClosure(),
    new NoRun(),
    new StoreModeDatesReader(modes.dates),
    new StorePayerModesReader(modes.payers),
    counting.standings,
    counting.mandates,
    counting.lot,
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
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      CLIENTS.standings,
      CLIENTS.mandates,
      CLIENTS.lot,
      new FixedClock(NOW),
    );

    const view = await handler.execute(new GetLegalEntityQuery("le1"));

    expect(view.nextCollection).toEqual({
      closesAt: "2026-10-31T23:00:00.000Z",
      plannedConstitutionAt: "2026-11-01T01:00:00.000Z",
      // 1er novembre + 14 = dimanche 15 → lundi 16 ; deux jours ouvrés avant : jeudi 12.
      collectionDay: "2026-11-16",
      depositDeadline: { day: "2026-11-12", time: "16:00" },
      // préparé le 1er novembre, neuf jours ouvrés avant la limite : rien à avertir.
      tightDepositMargin: null,
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
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      CLIENTS.standings,
      CLIENTS.mandates,
      CLIENTS.lot,
      clock,
    ).execute();
    const one = await new GetLegalEntityHandler(
      reader,
      new NoClosure(),
      new NoRun(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      CLIENTS.standings,
      CLIENTS.mandates,
      CLIENTS.lot,
      clock,
    ).execute(new GetLegalEntityQuery("le1"));

    expect(listed?.nextCollection).toEqual(one.nextCollection);
  });

  it("porte la dernière tentative de l'automatisme, issue et message compris", async () => {
    const handler = new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new OneRun(),
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      CLIENTS.standings,
      CLIENTS.mandates,
      CLIENTS.lot,
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
      new StoreModeDatesReader(new ModeDatesStore()),
      new StorePayerModesReader(new PayerModesStore()),
      CLIENTS.standings,
      CLIENTS.mandates,
      CLIENTS.lot,
      new FixedClock(NOW),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.lastAutopilotRun).toBeNull();
  });

  it("un payeur hebdomadaire du lundi : le calendrier court jusqu'au lundi suivant (R4, M3)", async () => {
    const view = await handlerWith(weeklyPayerFrom(new Date("2026-09-30T22:00:00.000Z"))).execute(
      new GetLegalEntityQuery("le1"),
    );

    // Jeudi 8 octobre → lundi 12 octobre 00h00 Paris ; délai de deux heures.
    expect(view.nextCollection).toMatchObject({
      closesAt: "2026-10-11T22:00:00.000Z",
      plannedConstitutionAt: "2026-10-12T00:00:00.000Z",
    });
  });
});

describe("le cycle en cours suit le calendrier de la facture (M3)", () => {
  it("un payeur qui passe à l'hebdomadaire au 1er novembre décale la clôture du cycle en cours", async () => {
    const modes = weeklyPayerFrom(new Date("2026-10-31T23:00:00.000Z"));
    const before = await handlerWith(modes).execute(new GetLegalEntityQuery("le1"));
    const after = await handlerWith(modes, new Date("2026-11-03T09:00:00.000Z")).execute(
      new GetLegalEntityQuery("le1"),
    );

    // Le 8 octobre : personne n'est encore hebdomadaire, le cycle court jusqu'au 1er novembre.
    expect(before.nextCollection.closesAt).toBe("2026-10-31T23:00:00.000Z");
    // Le 3 novembre : lundi 9 novembre 00h00 Paris, le premier lundi du payeur.
    expect(after.nextCollection.closesAt).toBe("2026-11-08T23:00:00.000Z");
    expect(after.lastClosure).toBe("2026-11-01T23:00:00.000Z");
  });
});

/** Un payeur hebdomadaire à partir de `effectiveFrom` (une clôture du mensuel). */
function weeklyPayerFrom(effectiveFrom: Date): Modes {
  const modes = new Modes();
  modes.payers.rows.push({
    ...STAMP,
    id: "p_week",
    legalEntityId: "le1",
    payerCompanyId: "cmp_week",
    effectiveFrom,
    mode: "weekly",
  });
  return modes;
}

const STAMP = {
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  createdByStaffId: "staff_1",
  cancelledAt: null,
  cancelledByStaffId: null,
};

describe("la fiche porte les dates des trois modes et la dernière clôture (M1, §16)", () => {
  it("rien de réglé : les trois défauts, aucun programmé, aucun verrou, aucun payeur", async () => {
    const view = await handlerWith(new Modes(), NOW, clientsOf("le1", [])).execute(
      new GetLegalEntityQuery("le1"),
    );

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

    const view = await handlerWith(modes).execute(new GetLegalEntityQuery("le1"));
    const monthly = view.billingModes[0];

    expect(monthly?.scheduled).toEqual({ days: [15], effectiveAt: "2026-10-31T23:00:00.000Z" });
    expect(monthly?.changeLockedUntil).toBe("2026-10-31T23:00:00.000Z");
    expect(monthly?.upcomingClosures.map((closure) => closure.periodLabel)).toEqual([
      "du 1er au 31 octobre 2026",
      "du 1er au 14 novembre 2026",
      "du 15 au 30 novembre 2026",
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

    const view = await handlerWith(modes).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingModes.map((mode) => mode.payerCount)).toEqual([0, 0, 1]);
    // Jeudi 8 octobre : le dernier lundi atteint est le 5 octobre.
    expect(view.lastClosure).toBe("2026-10-04T22:00:00.000Z");
  });

  /**
   * Régression : la fiche ne comptait au mensuel que les payeurs ayant choisi
   * un mode, et comptait un choix PROGRAMMÉ comme suivi — le tableau de bord
   * des rythmes annonçait un autre nombre (2026-10-23).
   */
  it("la fiche compte comme le tableau de bord : défaut au mensuel, programmé pas encore", async () => {
    const modes = new Modes();
    modes.payers.rows.push({
      ...STAMP,
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: "cmp_later",
      effectiveFrom: new Date("2026-10-31T23:00:00.000Z"),
      mode: "weekly",
    });

    const view = await handlerWith(
      modes,
      NOW,
      clientsOf("le1", ["cmp_default", "cmp_later"]),
    ).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingModes.map((mode) => [mode.mode, mode.payerCount])).toEqual([
      ["monthly", 2],
      ["semimonthly", 0],
      ["weekly", 0],
    ]);
  });

  /** Régression : la fiche comptait un payeur hebdomadaire désactivé (2026-10-23). */
  it("une société désactivée comptait comme client", async () => {
    const modes = new Modes();
    modes.payers.rows.push({
      ...STAMP,
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: "cmp_1",
      effectiveFrom: new Date("2026-09-30T22:00:00.000Z"),
      mode: "weekly",
    });
    const off = countingOf(
      [activePayer("cmp_1", { active: false })],
      [signedMandate("le1", "cmp_1")],
    );

    const view = await handlerWith(modes, NOW, off).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingModes.map((mode) => mode.payerCount)).toEqual([0, 0, 0]);
  });

  /** Régression : la fiche comptait un payeur sans mandat signé actif chez l'entité (2026-10-23). */
  it("un client sans mandat signé ne compte pas sur la fiche", async () => {
    const modes = new Modes();
    modes.payers.rows.push({
      ...STAMP,
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: "cmp_1",
      effectiveFrom: new Date("2026-09-30T22:00:00.000Z"),
      mode: "weekly",
    });
    const unsigned = countingOf([activePayer("cmp_1")], []);

    const view = await handlerWith(modes, NOW, unsigned).execute(new GetLegalEntityQuery("le1"));

    expect(view.billingModes.map((mode) => mode.payerCount)).toEqual([0, 0, 0]);
  });

  it("la période du lot à préparer : du 1er (clôture du mensuel) au lundi 5, sans modes : ceux du lot sont ceux de ses clients (M4c)", async () => {
    const modes = new Modes();
    modes.payers.rows.push({
      ...STAMP,
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: "cmp_1",
      effectiveFrom: new Date("2026-09-30T22:00:00.000Z"),
      mode: "weekly",
    });

    const view = await handlerWith(modes).execute(new GetLegalEntityQuery("le1"));

    expect(view.lastClosurePeriod).toEqual({
      closesAt: "2026-10-04T22:00:00.000Z",
      startsAt: "2026-09-30T22:00:00.000Z",
      label: "du 1er au 4 octobre 2026",
    });
  });

  it("personne n'a choisi : la période du mois (M4c)", async () => {
    const view = await handlerWith().execute(new GetLegalEntityQuery("le1"));

    expect(view.lastClosurePeriod).toEqual({
      closesAt: "2026-09-30T22:00:00.000Z",
      startsAt: "2026-08-31T22:00:00.000Z",
      label: "du 1er au 30 septembre 2026",
    });
  });
});
