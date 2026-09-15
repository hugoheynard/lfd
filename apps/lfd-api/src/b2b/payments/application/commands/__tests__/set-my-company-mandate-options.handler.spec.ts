import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
  MandateOptionsWithoutBankAccountError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  CustomerMandateClosedError,
  MandateOptionsBoundToActiveMandateError,
} from "../../../domain/errors/mandate-errors.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  activeMandate,
  bankAccount,
  FixedGate,
  FixedGuard,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  RecordingNotifier,
  StepPublisher,
  MemoryStore,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { SetMyCompanyMandateOptionsCommand } from "../set-my-company-mandate-options.command.js";
import { SetMyCompanyMandateOptionsHandler } from "../set-my-company-mandate-options.handler.js";

// Comparée à aucune horloge : c'est l'instant de la révocation.
const NOW = new Date("2026-09-14T09:00:00.000Z");
const OPTIONS = { debtorReference: "C-9P2X4B", contractNumber: "CT-42" };

function harness(
  options: { readonly role?: BankAccountRole | null; readonly open?: boolean } = {},
) {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mandates = new InMemoryMandates(steps);
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const handler = new SetMyCompanyMandateOptionsHandler(
    new FixedGuard(steps, options.role === undefined ? "owner" : options.role),
    new FixedGate(steps, options.open ?? true),
    accounts,
    mandates,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
    notifier,
    new MemoryStore(steps),
  );
  const run = () =>
    handler.execute(new SetMyCompanyMandateOptionsCommand("usr_1", "cmp_1", OPTIONS));
  return { steps, accounts, mandates, events, notifier, run };
}

describe("SetMyCompanyMandateOptionsHandler — le client règle les zones 14 et 19", () => {
  it.each<BankAccountRole>(["owner", "billing"])(
    "laisse %s écrire les zones, sans rien révoquer quand aucun brouillon n'existe",
    async (role) => {
      const h = harness({ role });

      await h.run();

      expect(h.accounts.saved).toHaveLength(1);
      expect(h.accounts.stored?.options.debtorReference).toBe("C-9P2X4B");
      expect(h.accounts.stored?.options.contractNumber).toBe("CT-42");
      expect(h.mandates.saved).toHaveLength(0);
      expect(h.notifier.notices).toHaveLength(0);
    },
  );

  /** Plan §10 (2026-09-14) : sans brouillon, la réécriture n'avait aucune trace. */
  it("journalise la réécriture du client DANS l'unité de travail, même sans brouillon", async () => {
    const h = harness();

    await h.run();

    expect(h.steps.log).toEqual([
      "guard",
      "gate",
      "mandate:find-current",
      "mandate:find-draft",
      "uow:begin",
      "account:save",
      "journal:payment_mandate.options_changed",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact().payload).toEqual({
      companyId: "cmp_1",
      ...OPTIONS,
      via: "customer",
    });
  });

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s en 403, sans rien lire au-delà du mur",
    async (role) => {
      const h = harness({ role });

      await expect(h.run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
      expect(h.steps.log).toEqual(["guard"]);
      expect(h.accounts.reads).toBe(0);
    },
  );

  it("refuse un non-membre en 404, sans rien lire au-delà du mur", async () => {
    const h = harness({ role: null });

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(h.steps.log).toEqual(["guard"]);
    expect(h.accounts.reads).toBe(0);
  });

  it("refuse en 409 quand le drapeau est fermé, après le mur", async () => {
    const h = harness({ open: false });

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.steps.log).toEqual(["guard", "gate"]);
    expect(h.accounts.reads).toBe(0);
  });

  it("refuse en 404 sans RIB, sans rien écrire ni révoquer", async () => {
    const h = harness();
    h.accounts.stored = null;
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateOptionsWithoutBankAccountError);
    expect(h.steps.log).toEqual(["guard", "gate"]);
    expect(h.events.traced).toHaveLength(0);
  });

  /** Plan §10 (2026-09-14) : les zones sont imprimées sur un papier déjà signé. */
  it("refuse en 409 sous un mandat actif, sans rien écrire", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateOptionsBoundToActiveMandateError);
    expect(h.accounts.saved).toHaveLength(0);
    expect(h.mandates.saved).toHaveLength(0);
    expect(h.accounts.stored?.options.contractNumber).toBe("");
    expect(h.events.traced).toHaveLength(0);
  });

  /** Plan §9 #4 : un brouillon signé après la réécriture porterait l'ancienne version. */
  it("révoque le brouillon dans la MÊME unité de travail, trace, puis sonne", async () => {
    const h = harness({ role: "billing" });
    h.mandates.draft = mandate({ scheme: "CORE" });

    await h.run();

    expect(h.steps.log).toEqual([
      "guard",
      "gate",
      "mandate:find-current",
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
      companyId: "cmp_1",
      reference: "LFC-9P2X4B-260914-K7M3QT",
      cause: "mandate_options_changed",
      via: "customer",
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
    const h = harness({ role: "billing" });
    h.mandates.draft = mandate({ scheme: "B2B" });

    await h.run();

    expect(h.mandates.saved).toHaveLength(0);
    expect(h.notifier.notices).toHaveLength(0);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.options_changed",
    ]);
  });
});
