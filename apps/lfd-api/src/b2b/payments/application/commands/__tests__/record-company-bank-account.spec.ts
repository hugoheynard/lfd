import { InvalidIbanError } from "../../../../accounting/domain/errors/accounting-errors.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  bankAccount,
  IBAN,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  MemoryStore,
  RecordingNotifier,
  RIB_PAYLOAD,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { recordCompanyBankAccount } from "../record-company-bank-account.js";

/**
 * Le fait `company.bank_account_changed` (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, 2026-09-19).
 *
 * Éprouvé sur la séquence partagée plutôt que sur chacun des deux handlers :
 * c'est elle qui l'écrit, pour le staff comme pour le client.
 */
const OTHER_IBAN = "DE89370400440532013000";

function build() {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  const mandates = new InMemoryMandates(steps);
  const events = new StepPublisher(steps);
  const deps = {
    accounts,
    ids: new FixedIdGenerator("cba"),
    mandates,
    clock: new FixedClock(new Date("2026-09-19T09:00:00.000Z")),
    events,
    uow: new StepUnitOfWork(steps),
    notifier: new RecordingNotifier(steps),
    store: new MemoryStore(steps),
  };
  return { deps, accounts, mandates, events, steps };
}

describe("recordCompanyBankAccount — le fait du RIB", () => {
  it("un premier dépôt : pas d'avant, l'après par ses quatre derniers et son titulaire", async () => {
    const { deps, events } = build();

    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, "customer", deps);

    expect(events.traced).toHaveLength(1);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "company.bank_account_changed",
      subjectType: "company",
      subjectId: "cmp_1",
      payload: {
        bankAccountId: "cba_000001",
        before: null,
        after: { last4: "2606", holder: RIB_PAYLOAD.holder },
        via: "customer",
      },
    });
  });

  it("un remplacement : l'avant est le compte d'avant, lu AVANT la mutation", async () => {
    const { deps, accounts, events } = build();
    accounts.stored = bankAccount();

    await recordCompanyBankAccount(
      "cmp_1",
      { ...RIB_PAYLOAD, iban: OTHER_IBAN, holder: "Refuge du Col SAS" },
      "staff",
      deps,
    );

    expect(events.traced[0]?.journalFact().payload).toEqual({
      bankAccountId: "cba_1",
      before: { last4: "2606", holder: RIB_PAYLOAD.holder },
      after: { last4: "3000", holder: "Refuge du Col SAS" },
      via: "staff",
    });
  });

  /** 🔴 Le journal se relit des années après, et se cherche en texte libre. */
  it("ne laisse entrer ni l'IBAN, ni le BIC, ni l'adresse", async () => {
    const { deps, accounts, events } = build();
    accounts.stored = bankAccount();

    await recordCompanyBankAccount("cmp_1", { ...RIB_PAYLOAD, iban: OTHER_IBAN }, "staff", deps);

    const written = JSON.stringify(events.traced[0]?.journalFact());
    expect(written).not.toContain(IBAN);
    expect(written).not.toContain(OTHER_IBAN);
    expect(written).not.toContain("20041010050500013M0");
    expect(written).not.toContain(RIB_PAYLOAD.bic);
    expect(written).not.toContain(RIB_PAYLOAD.line1);
  });

  it("écrit le RIB et son fait dans la MÊME unité de travail, avant le brouillon révoqué", async () => {
    const { deps, mandates, steps } = build();
    mandates.draft = mandate();

    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, "staff", deps);

    expect(
      steps.log.slice(steps.log.indexOf("uow:begin"), steps.log.indexOf("uow:end") + 1),
    ).toEqual([
      "uow:begin",
      "account:save",
      "journal:company.bank_account_changed",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
    ]);
  });

  it("n'écrit aucun fait quand l'IBAN est refusé", async () => {
    const { deps, events } = build();

    await expect(
      recordCompanyBankAccount(
        "cmp_1",
        { ...RIB_PAYLOAD, iban: "FR1420041010050500013M02607" },
        "staff",
        deps,
      ),
    ).rejects.toBeInstanceOf(InvalidIbanError);
    expect(events.traced).toHaveLength(0);
  });
});
