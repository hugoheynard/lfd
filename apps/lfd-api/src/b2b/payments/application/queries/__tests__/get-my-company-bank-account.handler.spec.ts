import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InMemoryMandates,
  RecordingNotifier,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import type { CompanyBankAccount } from "../../../domain/entities/company-bank-account.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../../domain/ports/company-bank-account.repository.js";
import { MandateOptions } from "../../../domain/value-objects/mandate-options.js";
import { recordCompanyBankAccount } from "../../commands/record-company-bank-account.js";
import { GetMyCompanyBankAccountHandler } from "../get-my-company-bank-account.handler.js";
import { GetMyCompanyBankAccountQuery } from "../get-my-company-bank-account.query.js";

const IBAN = "FR1420041010050500013M02606";

const PAYLOAD: SetCompanyBankAccountPayload = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

class FixedGuard extends BankAccountGuardReader {
  constructor(private readonly role: BankAccountRole | null) {
    super();
  }

  roleOf(_userId: string, _companyId: string): Promise<BankAccountRole | null> {
    return Promise.resolve(this.role);
  }
}

class FakeRepository extends CompanyBankAccountRepository {
  stored: CompanyBankAccount | null = null;
  reads = 0;

  findByCompany(_companyId: string): Promise<CompanyBankAccount | null> {
    this.reads += 1;
    return Promise.resolve(this.stored);
  }

  save(account: CompanyBankAccount): Promise<void> {
    this.stored = account;
    return Promise.resolve();
  }
}

/** Un dépôt qui porte déjà un RIB, semé par la séquence de production. */
async function repoWithAccount(): Promise<FakeRepository> {
  const repo = new FakeRepository();
  const steps = new Steps();
  await recordCompanyBankAccount("cmp_1", PAYLOAD, "customer", {
    accounts: repo,
    ids: new FixedIdGenerator("cba"),
    mandates: new InMemoryMandates(steps),
    clock: new FixedClock(new Date("2026-09-14T09:00:00.000Z")),
    events: new StepPublisher(steps),
    uow: new StepUnitOfWork(steps),
    notifier: new RecordingNotifier(steps),
  });
  repo.stored?.setOptions(
    MandateOptions.create({ debtorReference: "C-9P2X4B", contractNumber: "CT-42" }),
  );
  repo.reads = 0;
  return repo;
}

describe("GetMyCompanyBankAccountHandler", () => {
  it.each<BankAccountRole>(["owner", "billing"])(
    "rend à %s le RIB, last4 seulement et sans les zones du mandat",
    async (role) => {
      const repo = await repoWithAccount();
      const handler = new GetMyCompanyBankAccountHandler(new FixedGuard(role), repo);

      const view = await handler.execute(new GetMyCompanyBankAccountQuery("usr_1", "cmp_1"));

      expect(view).toEqual({
        holder: "Refuge du Col SARL",
        addressLine1: "12 rue des Alpages",
        addressLine2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
        bic: "CEPAFRPP751",
        last4: "2606",
      });
      expect(JSON.stringify(view)).not.toContain(IBAN);
    },
  );

  it("rend null tant qu'aucun RIB n'a été déposé", async () => {
    const handler = new GetMyCompanyBankAccountHandler(
      new FixedGuard("owner"),
      new FakeRepository(),
    );

    await expect(
      handler.execute(new GetMyCompanyBankAccountQuery("usr_1", "cmp_1")),
    ).resolves.toBeNull();
  });

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s (403) sans lire le RIB",
    async (role) => {
      const repo = await repoWithAccount();
      const handler = new GetMyCompanyBankAccountHandler(new FixedGuard(role), repo);

      await expect(
        handler.execute(new GetMyCompanyBankAccountQuery("usr_1", "cmp_1")),
      ).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
      expect(repo.reads).toBe(0);
    },
  );

  it("refuse un non-membre (404) sans lire le RIB", async () => {
    const repo = await repoWithAccount();
    const handler = new GetMyCompanyBankAccountHandler(new FixedGuard(null), repo);

    await expect(
      handler.execute(new GetMyCompanyBankAccountQuery("usr_1", "cmp_1")),
    ).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(repo.reads).toBe(0);
  });
});
