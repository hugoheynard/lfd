import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { MandateOptionsWithoutBankAccountError } from "../../../domain/errors/bank-account-errors.js";
import {
  activeMandate,
  bankAccount,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  RecordingNotifier,
  StepPublisher,
  MemoryStore,
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
    new MemoryStore(steps),
  );
  return {
    steps,
    accounts,
    mandates,
    events,
    notifier,
    run: () => handler.execute(new SetMandateOptionsCommand("cmp_1", OPTIONS)),
    execute: (command: SetMandateOptionsCommand) => handler.execute(command),
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

  /** Plan §10 (2026-09-14) : sans brouillon, la réécriture n'avait aucune trace. */
  it("journalise la réécriture DANS l'unité de travail, même sans brouillon", async () => {
    const h = harness();

    await h.run();

    expect(h.steps.log).toEqual([
      "mandate:find-draft",
      "uow:begin",
      "account:save",
      "journal:payment_mandate.options_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "payment_mandate.options_changed",
      subjectType: "company_bank_account",
      subjectId: "cba_1",
      payload: {
        // Le RIB nommé par son titulaire, la société par son nom du moment (lot B).
        subjectLabel: "Refuge du Col SARL",
        company: { id: "cmp_1", name: "Le Refuge du Col" },
        ...OPTIONS,
        via: "staff",
      },
    });
  });

  it("journalise les valeurs NORMALISÉES — celles que le papier imprimera", async () => {
    const h = harness();
    const command = new SetMandateOptionsCommand("cmp_1", {
      debtorReference: "  C-9P2X4B ",
      contractNumber: "CT-42  ",
    });

    await h.execute(command);

    expect(h.events.traced[0]?.journalFact().payload).toMatchObject(OPTIONS);
  });

  /**
   * Plan §9 #4 (2026-09-14) : les zones sont imprimées. Un brouillon signé après
   * leur réécriture porterait l'ancienne version.
   */
  it("révoque le brouillon dans la MÊME unité de travail, trace, puis sonne", async () => {
    const h = harness();
    h.mandates.draft = mandate({ scheme: "CORE" });

    await h.run();

    expect(h.steps.log).toEqual([
      "mandate:find-draft",
      "uow:begin",
      "account:save",
      "journal:payment_mandate.options_changed",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
      "bell",
    ]);
    expect(h.events.traced[1]?.journalFact().payload).toEqual({
      subjectLabel: "LFC-9P2X4B-260914-K7M3QT",
      company: { id: "cmp_1", name: "Le Refuge du Col" },
      reference: "LFC-9P2X4B-260914-K7M3QT",
      cause: "mandate_options_changed",
      via: "staff",
    });
    expect(h.notifier.notices[0]).toMatchObject({
      kind: "payment_mandate.draft_voided",
      idempotencyKey: "notification:payment_mandate.draft_voided:mdt_1",
    });
  });

  /**
   * Plan mandat deux schémas §10, Q2 (2026-09-15) : le formulaire
   * interentreprises n'imprime pas les zones 14 et 19. Réécrites, elles ne
   * changent rien à son papier — le brouillon reste signable. Le fait de la
   * réécriture, lui, reste au journal.
   */
  it("ne révoque PAS un brouillon interentreprises, et journalise quand même", async () => {
    const h = harness();
    h.mandates.draft = mandate({ scheme: "B2B" });

    await h.run();

    expect(h.mandates.saved).toHaveLength(0);
    expect(h.notifier.notices).toHaveLength(0);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.options_changed",
    ]);
  });

  it("ne touche pas au mandat actif", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await h.run();

    expect(h.mandates.saved).toHaveLength(0);
  });

  it("refuse en 404 sans RIB, sans rien écrire, révoquer ni journaliser", async () => {
    const h = harness();
    h.accounts.stored = null;
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateOptionsWithoutBankAccountError);
    expect(h.steps.log).toEqual([]);
    expect(h.events.traced).toHaveLength(0);
  });
});
