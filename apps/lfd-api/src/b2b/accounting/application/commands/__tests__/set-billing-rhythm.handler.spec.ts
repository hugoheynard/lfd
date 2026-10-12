import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  BillingRhythmChangePendingError,
  InvalidBillingRhythmError,
} from "../../../domain/errors/billing-rhythm-errors.js";
import { InvoicedClosuresReader } from "../../../domain/ports/invoiced-closures.reader.js";
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

/** Les clôtures que la facture a tentées, par `entité@instant`. */
class KnownInvoicedClosures extends InvoicedClosuresReader {
  readonly attemptedKeys = new Set<string>();
  readonly asked: string[] = [];

  attempted(legalEntityId: string, periodClosesAt: Date): Promise<boolean> {
    const key = `${legalEntityId}@${periodClosesAt.toISOString()}`;
    this.asked.push(key);
    return Promise.resolve(this.attemptedKeys.has(key));
  }
}

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const invoiced = new KnownInvoicedClosures();
  const handler = new SetBillingRhythmHandler(
    entities,
    invoiced,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, events, invoiced, handler };
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

  it("refuse un second changement tant que la clôture de prise d'effet n'est pas tentée", async () => {
    const h = harness();
    await h.handler.execute(new SetBillingRhythmCommand("le1", "weekly", [1]));
    h.steps.log.length = 0;

    await expect(
      h.handler.execute(new SetBillingRhythmCommand("le1", "semimonthly", [1, 16])),
    ).rejects.toThrow(BillingRhythmChangePendingError);
    expect(h.invoiced.asked).toEqual([`le1@${NEXT_FIRST.toISOString()}`]);
    expect(h.steps.log).toEqual([]);
  });

  it("admet un nouveau changement une fois la clôture de prise d'effet tentée", async () => {
    const h = harness();
    await h.handler.execute(new SetBillingRhythmCommand("le1", "weekly", [1]));
    h.invoiced.attemptedKeys.add(`le1@${NEXT_FIRST.toISOString()}`);

    await h.handler.execute(new SetBillingRhythmCommand("le1", "semimonthly", [1, 16]));

    expect(h.events.traced[1]?.journalFact().payload).toMatchObject({
      from: { kind: "weekly", days: [1] },
      to: { kind: "semimonthly", days: [1, 16] },
    });
  });

  it("ne lit pas la facture quand rien n'est programmé", async () => {
    const h = harness();

    await h.handler.execute(new SetBillingRhythmCommand("le1", "weekly", [1]));

    expect(h.invoiced.asked).toEqual([]);
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
