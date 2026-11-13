import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InvalidLegalEntityError,
  LegalEntityNotFoundError,
} from "../../../domain/errors/accounting-errors.js";
import { SetTransferDueDaysCommand } from "../legal-entity-commands.js";
import { SetTransferDueDaysHandler } from "../set-transfer-due-days.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-11-13T09:00:00.000Z");

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const handler = new SetTransferDueDaysHandler(
    entities,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, events, handler };
}

describe("SetTransferDueDaysHandler — l'échéance des factures au virement", () => {
  it("sauve et journalise l'APRÈS dans la même unité de travail", async () => {
    const h = harness();

    await h.handler.execute(new SetTransferDueDaysCommand("le1", 30));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.transfer_due_days_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.transfer_due_days_changed",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: { subjectLabel: "La Folie Douce", days: 30 },
    });
    expect(h.entities.rows.get("le1")?.transferDueDaysAfterIssue).toBe(30);
  });

  it("n'écrit rien quand le délai est déjà celui-là (15, le défaut)", async () => {
    const h = harness();

    await h.handler.execute(new SetTransferDueDaysCommand("le1", 15));

    expect(h.steps.log).toEqual([]);
  });

  it("refuse 46 jours sans rien écrire", async () => {
    const h = harness();

    await expect(h.handler.execute(new SetTransferDueDaysCommand("le1", 46))).rejects.toThrow(
      InvalidLegalEntityError,
    );
    expect(h.steps.log).toEqual([]);
  });

  it("refuse en 404 une entité inconnue", async () => {
    const h = harness();

    await expect(h.handler.execute(new SetTransferDueDaysCommand("absente", 30))).rejects.toThrow(
      LegalEntityNotFoundError,
    );
  });
});
