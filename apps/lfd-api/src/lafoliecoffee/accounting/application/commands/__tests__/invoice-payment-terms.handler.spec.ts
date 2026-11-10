import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { InvalidInvoicePaymentTermsError } from "../../../domain/errors/invoice-issuance-errors.js";
import { SetInvoicePaymentTermsCommand } from "../legal-entity-commands.js";
import { SetInvoicePaymentTermsHandler } from "../set-invoice-payment-terms.handler.js";
import {
  declaredEntity,
  SettingSteps,
  StepEntities,
  StepPublisher,
  StepUnitOfWork,
} from "./mandate-setting-doubles.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-10-08T09:00:00.000Z");

const TERMS = {
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "néant",
};

function harness() {
  const steps = new SettingSteps();
  const entities = new StepEntities(steps);
  entities.rows.set("le1", declaredEntity());
  const events = new StepPublisher(steps);
  const handler = new SetInvoicePaymentTermsHandler(
    entities,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, entities, events, handler };
}

describe("SetInvoicePaymentTermsHandler — les mentions de paiement de la facture", () => {
  it("sauve et journalise l'APRÈS dans la même unité de travail", async () => {
    const h = harness();

    await h.handler.execute(new SetInvoicePaymentTermsCommand("le1", TERMS));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "entity:save",
      "journal:legal_entity.invoice_payment_terms_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "legal_entity.invoice_payment_terms_changed",
      subjectType: "legal_entity",
      subjectId: "le1",
      occurredAt: NOW,
      payload: { subjectLabel: "La Folie Douce", ...TERMS },
    });
    expect(h.entities.rows.get("le1")?.paymentTerms.recoveryIndemnityCents).toBe(4_000);
  });

  it("n'écrit rien quand la saisie ne change rien (tout encore à renseigner)", async () => {
    const h = harness();

    await h.handler.execute(
      new SetInvoicePaymentTermsCommand("le1", {
        latePenaltyRateBasisPoints: null,
        recoveryIndemnityCents: null,
        earlyPaymentDiscount: "  ",
      }),
    );

    expect(h.steps.log).toEqual([]);
  });

  it("refuse une indemnité tapée en euros au lieu de centimes, sans rien écrire", async () => {
    const h = harness();

    await expect(
      h.handler.execute(
        new SetInvoicePaymentTermsCommand("le1", { ...TERMS, recoveryIndemnityCents: 40 }),
      ),
    ).rejects.toThrow(InvalidInvoicePaymentTermsError);
    expect(h.steps.log).toEqual([]);
  });

  it("refuse en 404 une entité inconnue", async () => {
    const h = harness();

    await expect(
      h.handler.execute(new SetInvoicePaymentTermsCommand("absente", TERMS)),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});
