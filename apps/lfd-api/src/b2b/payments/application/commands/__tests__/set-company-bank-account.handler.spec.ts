import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { InvalidIbanError } from "../../../../accounting/domain/errors/accounting-errors.js";
import type { IdGenerator } from "../../../../../platform/id/id-generator.js";
import type { CompanyBankAccount } from "../../../domain/entities/company-bank-account.js";
import type { CompanyBankAccountRepository } from "../../../domain/ports/company-bank-account.repository.js";
import { MandateOptions } from "../../../domain/value-objects/mandate-options.js";
import { SetCompanyBankAccountCommand } from "../set-company-bank-account.command.js";
import { SetCompanyBankAccountHandler } from "../set-company-bank-account.handler.js";

const IBAN = "FR1420041010050500013M02606";
const OTHER_IBAN = "DE89370400440532013000";

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

/** Doublé du port : il implémente l'interface, il ne la contourne pas. */
class FakeRepository implements CompanyBankAccountRepository {
  stored: CompanyBankAccount | null = null;
  readonly saved: CompanyBankAccount[] = [];
  /** Compté dans le doublé : `jest` n'est pas une globale en ESM. */
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

class FixedIds implements IdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `cba_${String(this.count)}`;
  }
}

function build(): { handler: SetCompanyBankAccountHandler; repo: FakeRepository } {
  const repo = new FakeRepository();
  return { handler: new SetCompanyBankAccountHandler(repo, new FixedIds()), repo };
}

describe("SetCompanyBankAccountHandler", () => {
  it("déclare le premier RIB avec un identifiant frappé par le port", async () => {
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));

    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]?.id).toBe("cba_1");
    expect(repo.saved[0]?.companyId).toBe("cmp_1");
    expect(repo.saved[0]?.account.iban.value).toBe(IBAN);
  });

  it("remplace le RIB existant sans en frapper un second", async () => {
    // L'agrégat est chargé puis muté : un second identifiant ferait deux lignes
    // là où `company_id` est unique, et l'écriture échouerait en base.
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));
    await handler.execute(
      new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, iban: OTHER_IBAN }),
    );

    expect(repo.saved).toHaveLength(2);
    expect(repo.saved[1]?.id).toBe("cba_1");
    expect(repo.stored?.account.iban.value).toBe(OTHER_IBAN);
  });

  it("prend une correction de titulaire sans rien casser", async () => {
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));
    await handler.execute(
      new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, holder: "Refuge du Col SAS" }),
    );

    expect(repo.stored?.account.holder).toBe("Refuge du Col SAS");
    expect(repo.stored?.account.iban.value).toBe(IBAN);
  });

  /**
   * Les value objects valident AVANT toute lecture : un IBAN mal recopié se
   * refuse sans avoir touché la base. L'inverse ferait une requête par saisie
   * fautive, et laisserait croire que la donnée a été vue.
   */
  it("refuse un IBAN invalide sans lire ni écrire", async () => {
    const { handler, repo } = build();

    await expect(
      handler.execute(
        new SetCompanyBankAccountCommand("cmp_1", {
          ...PAYLOAD,
          iban: "FR1420041010050500013M02607",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidIbanError);

    expect(repo.reads).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  it("ne fait jamais repartir l'IBAN refusé dans le message", async () => {
    // Le message d'une `DomainError` repart tel quel au client : un IBAN mal
    // saisi est à un caractère du vrai.
    const { handler } = build();
    const bad = "FR1420041010050500013M02607";
    let caught: unknown;
    try {
      await handler.execute(new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, iban: bad }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidIbanError);
    expect((caught as InvalidIbanError).message).not.toContain(bad);
  });

  it("crée le RIB avec des zones facultatives VIDES — elles ont leur route", async () => {
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));

    expect(repo.stored?.options.isEmpty).toBe(true);
  });

  /**
   * 🔴 Changer de banque ne change ni le contrat ni sa description. Les remettre
   * à zéro ferait perdre une saisie que personne n'a demandé à effacer — et
   * l'écran ne le dirait pas.
   */
  it("ne touche PAS aux zones facultatives en remplaçant le RIB", async () => {
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));
    repo.stored?.setOptions(
      MandateOptions.create({
        debtorReference: "C-9P2X4B",
        contractNumber: "CT-42",
        contractDescription: "Fourniture de café",
      }),
    );

    await handler.execute(
      new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, iban: OTHER_IBAN }),
    );

    expect(repo.stored?.options.contractNumber).toBe("CT-42");
    expect(repo.stored?.account.iban.value).toBe(OTHER_IBAN);
  });

  it("ne rend rien — CQRS, le client relit", async () => {
    const { handler } = build();
    await expect(
      handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD)),
    ).resolves.toBeUndefined();
  });
});
