import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { InvalidBillingRhythmError } from "../../../domain/errors/billing-rhythm-errors.js";
import { SetBillingRhythmCommand } from "../set-billing-rhythm.command.js";
import { SetBillingRhythmHandler } from "../set-billing-rhythm.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

// Comparées entre elles seulement : la prise d'effet se calcule depuis l'horloge figée.
const NOW = new Date("2026-10-12T10:00:00.000Z");
/** La prochaine clôture du mensuel au 1er après `NOW` : 1er novembre 00h00 Paris. */
const NEXT_FIRST = new Date("2026-10-31T23:00:00.000Z");

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const handler = new SetBillingRhythmHandler(
    entities,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, events, handler };
}

describe("SetBillingRhythmHandler — le rythme de facturation de l'entité", () => {
  it("sauve et journalise avant, après et prise d'effet dans la même unité de travail", async () => {
    const h = harness();

    await h.handler.execute(new SetBillingRhythmCommand("le1", "weekly", [1]));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.billing_rhythm_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.billing_rhythm_changed",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: {
        subjectLabel: "La Folie Douce",
        from: { kind: "monthly", days: [1] },
        to: { kind: "weekly", days: [1] },
        effectiveAt: NEXT_FIRST.toISOString(),
      },
    });
    expect(h.entities.rows.get("le1")?.billingRhythm.scheduled?.effectiveAt).toEqual(NEXT_FIRST);
  });

  it("n'écrit rien et ne journalise rien quand le rythme est déjà celui-là", async () => {
    const h = harness();

    await h.handler.execute(new SetBillingRhythmCommand("le1", "monthly", [1]));

    expect(h.steps.log).toEqual([]);
  });

  it("journalise l'annulation d'un programmé avec une prise d'effet nulle", async () => {
    const h = harness();
    await h.handler.execute(new SetBillingRhythmCommand("le1", "semimonthly", [1, 16]));

    await h.handler.execute(new SetBillingRhythmCommand("le1", "monthly", [1]));

    expect(h.events.traced[1]?.journalFact().payload).toMatchObject({
      to: { kind: "monthly", days: [1] },
      effectiveAt: null,
    });
    expect(h.entities.rows.get("le1")?.billingRhythm.scheduled).toBeNull();
  });

  it("refuse un 29 avant d'écrire quoi que ce soit", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetBillingRhythmCommand("le1", "monthly", [29])),
    ).rejects.toThrow(InvalidBillingRhythmError);
    expect(h.steps.log).toEqual([]);
  });

  it("refuse en 404 une entité inconnue", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetBillingRhythmCommand("absente", "weekly", [1])),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});
