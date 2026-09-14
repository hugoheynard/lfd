import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyBankAccountNotFoundError } from "../../../domain/errors/mandate-errors.js";
import {
  activeMandate,
  bankAccount,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  RecordingNotifier,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { SetMandateOptionsCommand } from "../set-mandate-options.command.js";
import { SetMandateOptionsHandler } from "../set-mandate-options.handler.js";

const NOW = new Date("2026-09-14T09:00:00.000Z");
const OPTIONS = { debtorReference: "C-9P2X4B", contractNumber: "CT-42" };

function harness() {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mandates = new InMemoryMandates(steps);
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const handler = new SetMandateOptionsHandler(
    accounts,
    mandates,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
    notifier,
  );
  return {
    steps,
    accounts,
    mandates,
    events,
    notifier,
    run: () => handler.execute(new SetMandateOptionsCommand("cmp_1", OPTIONS)),
  };
}

describe("SetMandateOptionsHandler — les zones 14 et 19", () => {
  it("écrit les zones sans rien révoquer quand aucun brouillon n'existe", async () => {
    const h = harness();

    await h.run();

    expect(h.accounts.stored?.options.contractNumber).toBe("CT-42");
    expect(h.mandates.saved).toHaveLength(0);
    expect(h.notifier.notices).toHaveLength(0);
  });

  /**
   * Plan §9 #4 (2026-09-14) : les zones sont imprimées. Un brouillon signé après
   * leur réécriture porterait l'ancienne version.
   */
  it("révoque le brouillon dans la MÊME unité de travail, trace, puis sonne", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    await h.run();

    expect(h.steps.log).toEqual([
      "mandate:find-draft",
      "uow:begin",
      "account:save",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
      "bell",
    ]);
    expect(h.events.traced[0]?.journalFact().payload).toEqual({
      companyId: "cmp_1",
      reference: "LFC-9P2X4B-260914-K7M3QT",
      cause: "mandate_options_changed",
    });
    expect(h.notifier.notices[0]).toMatchObject({
      kind: "payment_mandate.draft_voided",
      idempotencyKey: "notification:payment_mandate.draft_voided:mdt_1",
    });
  });

  it("ne touche pas au mandat actif", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await h.run();

    expect(h.mandates.saved).toHaveLength(0);
  });

  it("refuse en 404 sans RIB, sans rien écrire ni révoquer", async () => {
    const h = harness();
    h.accounts.stored = null;
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(CompanyBankAccountNotFoundError);
    expect(h.steps.log).toEqual([]);
  });
});
