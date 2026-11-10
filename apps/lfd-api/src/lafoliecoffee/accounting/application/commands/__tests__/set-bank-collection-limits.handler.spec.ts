import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { InvalidBankCollectionLimitError } from "../../../domain/errors/bank-collection-limits-errors.js";
import { SetBankCollectionLimitsCommand } from "../legal-entity-commands.js";
import { SetBankCollectionLimitsHandler } from "../set-bank-collection-limits.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-10-24T09:00:00.000Z");

const LIMITS = {
  scheme: "B2B" as const,
  perDebitCents: 500_000,
  perRemittanceCents: 2_000_000,
  monthlyCents: null,
};

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const handler = new SetBankCollectionLimitsHandler(
    entities,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, events, handler };
}

describe("SetBankCollectionLimitsHandler — les plafonds de la banque", () => {
  it("sauve et journalise le schéma et l'APRÈS dans la même unité de travail", async () => {
    const h = harness();

    await h.handler.execute(new SetBankCollectionLimitsCommand("le1", LIMITS));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.bank_collection_limits_set",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.bank_collection_limits_set",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: {
        subjectLabel: "La Folie Douce",
        scheme: "B2B",
        perDebitCents: 500_000,
        perRemittanceCents: 2_000_000,
        monthlyCents: null,
      },
    });
    const entity = h.entities.rows.get("le1");
    expect(entity?.bankCollectionLimits("B2B").perDebitCents).toBe(500_000);
    expect(entity?.bankCollectionLimits("CORE").isEmpty).toBe(true);
  });

  it("n'écrit rien quand la saisie ne change rien", async () => {
    const h = harness();

    await h.handler.execute(
      new SetBankCollectionLimitsCommand("le1", {
        scheme: "B2B",
        perDebitCents: null,
        perRemittanceCents: null,
        monthlyCents: null,
      }),
    );

    expect(h.steps.log).toEqual([]);
  });

  it("accepte un unitaire au-dessus du mensuel : la banque n'a rien dit de l'ordre", async () => {
    const h = harness();

    await h.handler.execute(
      new SetBankCollectionLimitsCommand("le1", { ...LIMITS, monthlyCents: 100 }),
    );

    expect(h.entities.rows.get("le1")?.bankCollectionLimits("B2B").monthlyCents).toBe(100);
  });

  it("refuse un plafond nul, sans rien écrire", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetBankCollectionLimitsCommand("le1", { ...LIMITS, perDebitCents: 0 })),
    ).rejects.toThrow(InvalidBankCollectionLimitError);
    expect(h.steps.log).toEqual([]);
  });

  it("refuse en 404 une entité inconnue", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetBankCollectionLimitsCommand("absente", LIMITS)),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});
