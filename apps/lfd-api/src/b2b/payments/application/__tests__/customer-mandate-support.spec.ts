import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { drawnText } from "../../../accounting/domain/services/__tests__/pdf-drawn-text.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import { CompanyNotFoundForMandateError } from "../../domain/errors/mandate-errors.js";
import { MandateAccountChangedError } from "../../domain/errors/sub-account-mandate-errors.js";
import { buildCustomerMandate } from "../customer-mandate-support.js";
import {
  FixedDebtors,
  bankAccount,
  CREDITOR,
  FixedCreditors,
  HOLDER,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  MemoryStore,
  Steps,
} from "./payment-doubles.js";

class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

const B2B_TITLE = "MANDAT DE PRÉLÈVEMENT SEPA INTERENTREPRISES";

function harness(issuerScheme: "CORE" | "B2B") {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const mandates = new InMemoryMandates(steps);
  const deps = {
    accounts,
    mandates,
    creditors: new FixedCreditors({ ...CREDITOR, mandateScheme: issuerScheme }),
    logos: new NoLogo(),
    store: new MemoryStore(steps),
    debtors: new FixedDebtors(mandates),
    clock: new FixedClock(new Date("2026-09-14T09:00:00.000Z")),
  };
  return {
    mandates,
    accounts,
    debtors: deps.debtors,
    build: () => buildCustomerMandate(deps, "cmp_1"),
  };
}

describe("buildCustomerMandate — quelle forme est imprimée", () => {
  /**
   * 🔴 Objection 2 du plan `mandat-deux-schemas.md` : le brouillon est
   * frappé en interentreprises, l'entité passe ensuite en CORE. C'est ce
   * brouillon-là que le staff activera et que le lot prélèvera en B2B — le
   * papier signé doit donc être interentreprises, pas le réglage du jour.
   */
  it("imprime un brouillon B2B en B2B même quand l'émetteur est passé CORE", async () => {
    const h = harness("CORE");
    h.mandates.draft = mandate({ scheme: "B2B" });

    const text = drawnText((await h.build()).bytes);

    expect(text).toContain(B2B_TITLE);
    expect(text).not.toContain("8 semaines");
  });

  it("imprime un brouillon CORE en CORE même quand l'émetteur est passé B2B", async () => {
    const h = harness("B2B");
    h.mandates.draft = mandate({ scheme: "CORE" });

    const text = drawnText((await h.build()).bytes);

    expect(text).toContain("8 semaines");
    expect(text).not.toContain(B2B_TITLE);
  });

  it("sans brouillon, montre l'aperçu sous le réglage de l'émetteur", async () => {
    const text = drawnText((await harness("B2B").build()).bytes);

    expect(text).toContain("EXEMPLE");
    expect(text).toContain("MANDAT SEPA INTERENTREPRISES");
  });

  /**
   * Plan mentions obligatoires §9 (2026-09-15) : le SIREN imprimé est celui
   * STOCKÉ, plus un préfixe de SIRET — et la forme juridique du titulaire,
   * vide jusque-là, vient du RIB.
   */
  it("imprime le SIREN stocké, la raison sociale et la forme juridique du titulaire", async () => {
    const h = harness("B2B");
    h.mandates.holder = { ...HOLDER, siren: "732829320", companyName: "SAS Débitrice" };
    h.accounts.stored = CompanyBankAccount.reconstitute({
      ...bankAccount().toPersistence(),
      holderLegalForm: "Madame",
    });

    const text = drawnText((await h.build()).bytes);

    expect(text.replace(/\s/gu, "")).toContain("732829320");
    expect(text).toContain("SAS Débitrice");
    expect(text).toContain("Madame");
  });

  it("refuse en 404 quand la société a disparu, sans rien composer", async () => {
    const h = harness("B2B");
    h.mandates.holder = null;

    await expect(h.build()).rejects.toBeInstanceOf(CompanyNotFoundForMandateError);
  });
});

/**
 * Plan-sous-comptes §2.1 ter : le papier d'un mandat de site nomme le DÉBITEUR
 * figé à la frappe — la société du principal —, jamais la ligne du site.
 */
describe("buildCustomerMandate — le mandat d'un site", () => {
  const PRINCIPAL_DEBTOR = {
    companyId: "alpes",
    siren: "552100554",
    name: "Alpes Chalets Privés",
    legalForm: "SAS",
  };

  it("imprime la raison sociale et le SIREN du principal", async () => {
    const h = harness("B2B");
    h.debtors.billedTo = { companyId: "alpes", name: "Alpes Chalets Privés" };
    h.mandates.draft = mandate({ bankAccountId: "cba_1", debtor: PRINCIPAL_DEBTOR });

    const text = drawnText((await h.build()).bytes);

    expect(text).toContain("Alpes Chalets Privés");
    expect(text).toContain("552100554");
  });

  it("refuse un brouillon frappé pour un autre compte que celui qu'on imprimerait", async () => {
    const h = harness("B2B");
    h.mandates.draft = mandate({ bankAccountId: "cba_autre", debtor: PRINCIPAL_DEBTOR });

    await expect(h.build()).rejects.toBeInstanceOf(MandateAccountChangedError);
  });
});
