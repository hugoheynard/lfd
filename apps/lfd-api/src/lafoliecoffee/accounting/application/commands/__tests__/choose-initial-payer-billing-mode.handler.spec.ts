import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PayerBillingModeAlreadyChosenError } from "../../../domain/errors/billing-mode-errors.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { ChooseInitialPayerBillingModeCommand } from "../choose-initial-payer-billing-mode.command.js";
import { ChooseInitialPayerBillingModeHandler } from "../choose-initial-payer-billing-mode.handler.js";
import {
  FixedOrderHistory,
  FixedStandings,
  ModeDatesStore,
  PayerModesStore,
  InMemoryPayerModes,
  StoreModeDatesReader,
} from "./billing-mode-doubles.js";
import {
  PayerMeansStore,
  RecordingPayerLock,
  StorePayerMeansReader,
} from "./collection-means-doubles.js";
import { declaredEntity, SettingSteps, StepEntities } from "./mandate-setting-doubles.js";

/** Le 8 octobre 2026, horloge FIXE : la dernière clôture du mensuel est le 1er octobre. */
const NOW = paris("2026-10-08", "11:00");

/** Un compte qu'on ouvre : il n'a jamais commandé. */
const NEWCOMER = { companyId: "cmp_new", name: "Le Nouveau", active: true, follows: [] };

function world() {
  const entities = new StepEntities(new SettingSteps());
  entities.rows.set("le1", declaredEntity());
  const payers = new PayerModesStore();
  const events = new RecordingPublisher();
  const handler = new ChooseInitialPayerBillingModeHandler(
    entities,
    new FixedStandings([NEWCOMER]),
    new StoreModeDatesReader(new ModeDatesStore()),
    new InMemoryPayerModes(payers),
    new FixedOrderHistory(new Set()),
    new StorePayerMeansReader(new PayerMeansStore()),
    new RecordingPayerLock(),
    new FixedClock(NOW),
    new FixedIdGenerator("seg"),
    events,
    new DirectUnitOfWork(),
  );
  return { payers, events, handler };
}

function choose(mode: string): ChooseInitialPayerBillingModeCommand {
  return new ChooseInitialPayerBillingModeCommand("le1", "cmp_new", mode, "staff_societes");
}

describe("ChooseInitialPayerBillingModeHandler", () => {
  it("pose le premier choix, immédiat pour un compte qu'on ouvre, avec le fait du changement", async () => {
    const w = world();

    await w.handler.execute(choose("weekly"));

    expect(w.payers.rows).toHaveLength(1);
    expect(w.payers.rows[0]).toMatchObject({
      payerCompanyId: "cmp_new",
      mode: "weekly",
      effectiveFrom: paris("2026-10-01"),
      createdByStaffId: "staff_societes",
    });
    expect(w.events.factTypes()).toEqual(["payer.billing_mode_changed"]);
    expect(w.events.traced[0]?.journalFact().payload).toMatchObject({
      from: "monthly",
      to: "weekly",
      immediate: true,
    });
  });

  it("le mensuel par défaut, choisi explicitement, est un premier choix écrit", async () => {
    const w = world();
    await w.handler.execute(choose("monthly"));
    expect(w.payers.rows).toHaveLength(1);
  });

  it("refuse un autre mode une fois le premier choix posé, sans rien écrire", async () => {
    const w = world();
    await w.handler.execute(choose("weekly"));

    await expect(w.handler.execute(choose("semimonthly"))).rejects.toBeInstanceOf(
      PayerBillingModeAlreadyChosenError,
    );
    await expect(w.handler.execute(choose("semimonthly"))).rejects.toMatchObject({
      code: "accounting.payer_mode.already_chosen",
    });
    expect(w.payers.saves).toBe(1);
    expect(w.events.factTypes()).toEqual(["payer.billing_mode_changed"]);
  });

  it("le même premier choix rejoué (double clic) réussit sans écriture ni fait", async () => {
    const w = world();
    await w.handler.execute(choose("weekly"));

    await w.handler.execute(choose("weekly"));

    expect(w.payers.saves).toBe(1);
    expect(w.payers.rows).toHaveLength(1);
    expect(w.events.factTypes()).toEqual(["payer.billing_mode_changed"]);
  });
});
