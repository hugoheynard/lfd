import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  BillingModeDatesChangePendingError,
  BillingPayerNotFoundError,
  NoScheduledBillingModeDatesError,
  NotABillingPayerError,
} from "../../../domain/errors/billing-mode-errors.js";
import { InvalidBillingRhythmError } from "../../../domain/errors/billing-rhythm-errors.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { CancelBillingModeDatesCommand } from "../cancel-billing-mode-dates.command.js";
import { CancelBillingModeDatesHandler } from "../cancel-billing-mode-dates.handler.js";
import { CancelPayerBillingModeCommand } from "../cancel-payer-billing-mode.command.js";
import { CancelPayerBillingModeHandler } from "../cancel-payer-billing-mode.handler.js";
import { ScheduleBillingModeDatesCommand } from "../schedule-billing-mode-dates.command.js";
import { ScheduleBillingModeDatesHandler } from "../schedule-billing-mode-dates.handler.js";
import { SetPayerBillingModeCommand } from "../set-payer-billing-mode.command.js";
import { SetPayerBillingModeHandler } from "../set-payer-billing-mode.handler.js";
import {
  FixedStandings,
  InMemoryModeDates,
  InMemoryPayerModes,
  ModeDatesStore,
  PAYER,
  PayerModesStore,
  StoreModeDatesReader,
} from "./billing-mode-doubles.js";
import { declaredEntity, SettingSteps, StepEntities } from "./mandate-setting-doubles.js";

/** Le 8 octobre 2026, horloge FIXE : la prochaine clôture du mensuel est le 1er novembre. */
const NOW = paris("2026-10-08", "11:00");

const SITE = {
  companyId: "cmp_site",
  name: "Site Annexe",
  active: true,
  follows: [
    {
      companyId: "cmp_site",
      payerId: "cmp_group",
      payerName: "Groupe Payeur",
      validFrom: paris("2026-09-01"),
      validTo: null,
    },
  ],
};

function world() {
  const entities = new StepEntities(new SettingSteps());
  entities.rows.set("le1", declaredEntity());
  const dates = new ModeDatesStore();
  const payers = new PayerModesStore();
  const clock = new FixedClock(NOW);
  const events = new RecordingPublisher();
  const ids = new FixedIdGenerator("seg");
  const standings = new FixedStandings([PAYER, SITE]);
  return {
    dates,
    payers,
    clock,
    events,
    schedule: new ScheduleBillingModeDatesHandler(
      entities,
      new InMemoryModeDates(dates),
      clock,
      ids,
      events,
      new DirectUnitOfWork(),
    ),
    cancel: new CancelBillingModeDatesHandler(
      entities,
      new InMemoryModeDates(dates),
      clock,
      events,
      new DirectUnitOfWork(),
    ),
    setPayer: new SetPayerBillingModeHandler(
      entities,
      standings,
      new StoreModeDatesReader(dates),
      new InMemoryPayerModes(payers),
      clock,
      ids,
      events,
      new DirectUnitOfWork(),
    ),
    cancelPayer: new CancelPayerBillingModeHandler(
      entities,
      standings,
      new InMemoryPayerModes(payers),
      clock,
      events,
      new DirectUnitOfWork(),
    ),
  };
}

describe("ScheduleBillingModeDatesHandler / CancelBillingModeDatesHandler", () => {
  it("programme, écrit un segment et journalise le fait avec sa prise d'effet", async () => {
    const w = world();

    await w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "weekly", [3], "staff_1"));

    expect(w.dates.rows).toHaveLength(1);
    expect(w.dates.rows[0]).toMatchObject({
      mode: "weekly",
      effectiveFrom: paris("2026-10-12"),
      createdByStaffId: "staff_1",
      createdAt: NOW,
    });
    expect(w.events.factTypes()).toEqual(["legal_entity.billing_mode_dates_changed"]);
    expect(w.events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "La Folie Douce",
      mode: "weekly",
      from: [1],
      to: [3],
      effectiveAt: paris("2026-10-12").toISOString(),
      cancelled: false,
    });
  });

  it("les dates en vigueur redemandées : ni écriture ni fait", async () => {
    const w = world();
    await w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "monthly", [1], "staff_1"));
    expect(w.dates.saves).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("refuse un second changement, sans rien écrire", async () => {
    const w = world();
    await w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "monthly", [15], "s"));

    await expect(
      w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "monthly", [10], "s")),
    ).rejects.toThrow(BillingModeDatesChangePendingError);
    expect(w.dates.rows).toHaveLength(1);
    expect(w.events.factTypes()).toHaveLength(1);
  });

  it("refuse un mode inconnu (400) et une entité inconnue (404)", async () => {
    const w = world();
    await expect(
      w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "yearly", [1], "s")),
    ).rejects.toThrow(InvalidBillingRhythmError);
    await expect(
      w.schedule.execute(new ScheduleBillingModeDatesCommand("ghost", "monthly", [15], "s")),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });

  it("annule : pose l'annulation, garde la ligne, journalise `cancelled`", async () => {
    const w = world();
    await w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "monthly", [15], "s"));

    await w.cancel.execute(new CancelBillingModeDatesCommand("le1", "monthly", "staff_2"));

    expect(w.dates.rows).toHaveLength(1);
    expect(w.dates.rows[0]).toMatchObject({ cancelledAt: NOW, cancelledByStaffId: "staff_2" });
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      from: [15],
      to: [1],
      cancelled: true,
    });
  });

  it("refuse d'annuler quand rien n'est programmé", async () => {
    await expect(
      world().cancel.execute(new CancelBillingModeDatesCommand("le1", "monthly", "s")),
    ).rejects.toThrow(NoScheduledBillingModeDatesError);
  });
});

describe("SetPayerBillingModeHandler / CancelPayerBillingModeHandler", () => {
  it("programme le mode d'un payeur à la prochaine clôture de sa suite, et le journalise sur lui", async () => {
    const w = world();

    await w.setPayer.execute(new SetPayerBillingModeCommand("le1", PAYER.companyId, "weekly", "s"));

    expect(w.payers.rows[0]).toMatchObject({
      payerCompanyId: PAYER.companyId,
      mode: "weekly",
      effectiveFrom: paris("2026-11-01"),
    });
    const fact = w.events.traced[0]?.journalFact();
    expect(fact).toMatchObject({ type: "payer.billing_mode_changed", subjectId: PAYER.companyId });
    expect(fact?.payload).toEqual({
      subjectLabel: "Le Bistrot",
      legalEntity: { id: "le1", name: "La Folie Douce" },
      from: "monthly",
      to: "weekly",
      effectiveAt: paris("2026-11-01").toISOString(),
      cancelled: false,
    });
  });

  it("la prise d'effet lit les dates réglées du mode actuel", async () => {
    const w = world();
    // Le mensuel passe au 15 le 1er novembre ; le 3, le payeur mensuel clôt ensuite le 15.
    await w.schedule.execute(new ScheduleBillingModeDatesCommand("le1", "monthly", [15], "s"));
    w.clock.set(paris("2026-11-03"));

    await w.setPayer.execute(new SetPayerBillingModeCommand("le1", PAYER.companyId, "weekly", "s"));

    expect(w.payers.rows[0]?.effectiveFrom).toEqual(paris("2026-11-15"));
  });

  it("refuse un site facturé chez un autre, en le nommant, sans rien écrire", async () => {
    const w = world();
    await expect(
      w.setPayer.execute(new SetPayerBillingModeCommand("le1", "cmp_site", "weekly", "s")),
    ).rejects.toThrow(NotABillingPayerError);
    expect(w.payers.saves).toBe(0);
  });

  it("refuse un compte inconnu", async () => {
    await expect(
      world().setPayer.execute(new SetPayerBillingModeCommand("le1", "ghost", "weekly", "s")),
    ).rejects.toThrow(BillingPayerNotFoundError);
  });

  it("annule le mode programmé, et journalise l'annulation", async () => {
    const w = world();
    await w.setPayer.execute(new SetPayerBillingModeCommand("le1", PAYER.companyId, "weekly", "s"));

    await w.cancelPayer.execute(new CancelPayerBillingModeCommand("le1", PAYER.companyId, "s2"));

    expect(w.payers.rows[0]?.cancelledAt).toEqual(NOW);
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      from: "weekly",
      to: "monthly",
      cancelled: true,
    });
  });
});
