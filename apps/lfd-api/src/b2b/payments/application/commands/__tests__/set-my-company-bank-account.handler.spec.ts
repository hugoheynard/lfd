import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { InvalidIbanError } from "../../../../accounting/domain/errors/accounting-errors.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
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
import { SetMyCompanyBankAccountCommand } from "../set-my-company-bank-account.command.js";
import { SetMyCompanyBankAccountHandler } from "../set-my-company-bank-account.handler.js";

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

/** Doublé du mur : rend le rôle qu'on lui donne, et retient qui il a lu. */
class FixedGuard extends BankAccountGuardReader {
  readonly asked: { userId: string; companyId: string }[] = [];

  constructor(private readonly role: BankAccountRole | null) {
    super();
  }

  roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    this.asked.push({ userId, companyId });
    return Promise.resolve(this.role);
  }
}

/** Doublé du dépôt : compte les lectures, garde les écritures. */
class FakeRepository extends CompanyBankAccountRepository {
  stored: CompanyBankAccount | null = null;
  readonly saved: CompanyBankAccount[] = [];
  reads = 0;

  findByCompany(_companyId: string): Promise<CompanyBankAccount | null> {
    this.reads += 1;
    return Promise.resolve(this.stored);
  }

  save(account: CompanyBankAccount): Promise<void> {
    this.saved.push(account);
    this.stored = account;
    return Promise.resolve();
  }
}

function build(role: BankAccountRole | null): {
  handler: SetMyCompanyBankAccountHandler;
  guard: FixedGuard;
  repo: FakeRepository;
} {
  const guard = new FixedGuard(role);
  const repo = new FakeRepository();
  const handler = new SetMyCompanyBankAccountHandler(guard, repo, new FixedIdGenerator("cba"));
  return { handler, guard, repo };
}

describe("SetMyCompanyBankAccountHandler", () => {
  it.each<BankAccountRole>(["owner", "billing"])("laisse %s déposer le RIB", async (role) => {
    const { handler, guard, repo } = build(role);

    await handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD));

    expect(guard.asked).toEqual([{ userId: "usr_1", companyId: "cmp_1" }]);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]?.companyId).toBe("cmp_1");
    expect(repo.saved[0]?.account.iban.value).toBe(IBAN);
  });

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s (403) sans lire ni écrire le RIB",
    async (role) => {
      const { handler, repo } = build(role);

      await expect(
        handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD)),
      ).rejects.toBeInstanceOf(BankAccountRoleRequiredError);

      expect(repo.reads).toBe(0);
      expect(repo.saved).toHaveLength(0);
    },
  );

  it("refuse un non-membre (404) sans lire ni écrire le RIB", async () => {
    const { handler, repo } = build(null);

    await expect(
      handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);

    expect(repo.reads).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  /**
   * Le mur passe AVANT la validation : un non-membre qui recevrait un 400
   * apprendrait que la société existe et que sa saisie a été lue.
   */
  it("oppose le mur avant de valider l'IBAN", async () => {
    const { handler } = build(null);

    await expect(
      handler.execute(
        new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", {
          ...PAYLOAD,
          iban: "FR1420041010050500013M02607",
        }),
      ),
    ).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
  });

  it("refuse un IBAN invalide d'un membre autorisé, sans lire le RIB", async () => {
    const { handler, repo } = build("owner");

    await expect(
      handler.execute(
        new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", {
          ...PAYLOAD,
          iban: "FR1420041010050500013M02607",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidIbanError);

    expect(repo.reads).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  it("remplace le RIB existant sans en frapper un second", async () => {
    const { handler, repo } = build("billing");
    await handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD));
    await handler.execute(
      new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", { ...PAYLOAD, holder: "Refuge SAS" }),
    );

    expect(repo.saved).toHaveLength(2);
    expect(repo.saved[1]?.id).toBe(repo.saved[0]?.id);
    expect(repo.stored?.account.holder).toBe("Refuge SAS");
  });
});
