import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { SetMandateSchemeCommand } from "../set-mandate-scheme.command.js";
import { SetMandateSchemeHandler } from "../set-mandate-scheme.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepDrafts,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-09-15T09:00:00.000Z");

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const drafts = new StepDrafts(steps);
  const events = new StepPublisher(steps);
  const handler = new SetMandateSchemeHandler(
    entities,
    drafts,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, drafts, events, handler };
}

describe("SetMandateSchemeHandler — la bascule CORE ↔ interentreprises", () => {
  it("n'écrit RIEN quand le schéma ne change pas — ni entité, ni fait, ni caducité", async () => {
    const h = harness();

    await h.handler.execute(new SetMandateSchemeCommand("le1", "B2B"));

    expect(h.steps.log).toEqual([]);
    expect(h.drafts.calls).toEqual([]);
  });

  /**
   * Plan mandat deux schémas §3.3 et §9 #8 : l'entité, le fait et la caducité
   * tombent ensemble ; la cloche part après, hors transaction.
   */
  it("sauve, journalise avant → après, révoque les brouillons DANS l'unité de travail, puis sonne", async () => {
    const h = harness();

    await h.handler.execute(new SetMandateSchemeCommand("le1", "CORE"));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.mandate_scheme_changed",
      "drafts:void:mandate_scheme_changed",
      "uow:end",
      "drafts:bell:1",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.mandate_scheme_changed",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: { from: "B2B", to: "CORE" },
    });
    expect(h.drafts.calls).toEqual([
      { creditorId: "le1", cause: "mandate_scheme_changed", via: "staff" },
    ]);
    expect(h.entities.rows.get("le1")?.mandateScheme).toBe("CORE");
  });

  it("n'utilise que publishTraced dans la transaction — un abonné y hériterait d'une transaction refermée", async () => {
    const h = harness();

    await h.handler.execute(new SetMandateSchemeCommand("le1", "CORE"));

    expect(h.steps.log).not.toContain("publish");
  });

  it("revient en interentreprises en journalisant le sens inverse", async () => {
    const h = harness();
    await h.handler.execute(new SetMandateSchemeCommand("le1", "CORE"));

    await h.handler.execute(new SetMandateSchemeCommand("le1", "B2B"));

    expect(h.events.traced.map((event) => event.journalFact().payload)).toEqual([
      { from: "B2B", to: "CORE" },
      { from: "CORE", to: "B2B" },
    ]);
  });

  it("refuse une entité inconnue en 404, sans rien écrire", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetMandateSchemeCommand("inconnue", "CORE")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
    expect(h.steps.log).toEqual([]);
  });
});
