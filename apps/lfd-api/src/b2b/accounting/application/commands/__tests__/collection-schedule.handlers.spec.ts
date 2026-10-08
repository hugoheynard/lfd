import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { CollectionBeforeNoticeError } from "../../../domain/errors/collection-schedule-errors.js";
import {
  SetAutoCollectionCommand,
  SetCollectionScheduleCommand,
} from "../legal-entity-commands.js";
import { SetAutoCollectionHandler } from "../set-auto-collection.handler.js";
import { SetCollectionScheduleHandler } from "../set-collection-schedule.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-10-08T09:00:00.000Z");

const SCHEDULE = {
  delayHours: 2,
  daysAfterClosure: 20,
  depositCutoff: { businessDaysBefore: 2, time: "16:00" },
};

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const uow = new StepUnitOfWork(steps);
  const clock = new FixedClock(NOW);
  return {
    steps,
    entities,
    events,
    schedule: new SetCollectionScheduleHandler(entities, clock, events, uow),
    auto: new SetAutoCollectionHandler(entities, clock, events, uow),
  };
}

describe("SetCollectionScheduleHandler — le calendrier de prélèvement", () => {
  it("sauve et journalise l'APRÈS dans la même unité de travail", async () => {
    const h = harness();

    await h.schedule.execute(new SetCollectionScheduleCommand("le1", SCHEDULE));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.collection_schedule_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.collection_schedule_changed",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: {
        subjectLabel: "La Folie Douce",
        delayHours: 2,
        daysAfterClosure: 20,
        depositCutoffBusinessDays: 2,
        depositCutoffTime: "16:00",
      },
    });
    expect(h.entities.rows.get("le1")?.collectionSchedule.daysAfterClosure).toBe(20);
  });

  it("n'écrit rien quand la saisie ne change rien", async () => {
    const h = harness();

    await h.schedule.execute(
      new SetCollectionScheduleCommand("le1", {
        delayHours: 1,
        daysAfterClosure: null,
        depositCutoff: null,
      }),
    );

    expect(h.steps.log).toEqual([]);
  });

  it("refuse N sous le délai de pré-notification (14 j), sans rien écrire", async () => {
    const h = harness();

    await expect(
      h.schedule.execute(
        new SetCollectionScheduleCommand("le1", { ...SCHEDULE, daysAfterClosure: 9 }),
      ),
    ).rejects.toThrow(CollectionBeforeNoticeError);
    expect(h.steps.log).toEqual([]);
  });

  it("refuse en 404 une entité inconnue", async () => {
    const h = harness();

    await expect(
      h.schedule.execute(new SetCollectionScheduleCommand("absente", SCHEDULE)),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});

describe("SetAutoCollectionHandler — un fait distinct à chaque bascule", () => {
  it("activer journalise auto_collection_enabled, désactiver auto_collection_disabled", async () => {
    const h = harness();

    await h.auto.execute(new SetAutoCollectionCommand("le1", true));
    await h.auto.execute(new SetAutoCollectionCommand("le1", false));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.auto_collection_enabled",
      "uow:end",
      "uow:begin",
      "entity:save",
      "journal:legal_entity.auto_collection_disabled",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact().payload).toEqual({ subjectLabel: "La Folie Douce" });
  });

  it("n'écrit rien quand l'état ne change pas", async () => {
    const h = harness();

    await h.auto.execute(new SetAutoCollectionCommand("le1", false));

    expect(h.steps.log).toEqual([]);
  });
});
