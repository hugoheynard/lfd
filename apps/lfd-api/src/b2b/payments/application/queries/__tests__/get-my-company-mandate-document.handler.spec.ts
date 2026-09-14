import { drawnText } from "../../../../accounting/domain/services/__tests__/pdf-drawn-text.js";
import { LegalEntityLogoReader } from "../../../../accounting/domain/ports/legal-entity-logo.reader.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  CustomerMandateClosedError,
  MandateDocumentNotFoundError,
} from "../../../domain/errors/mandate-errors.js";
import type { PaymentMandate } from "../../../domain/entities/payment-mandate.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  activeMandate,
  bankAccount,
  FixedCreditors,
  FixedGate,
  FixedGuard,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  MemoryStore,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { GetMyCompanyMandateDocumentHandler } from "../get-my-company-mandate-document.handler.js";
import { GetMyCompanyMandateDocumentQuery } from "../get-my-company-mandate-document.query.js";

class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/**
 * Le brouillon disparaît entre les deux lectures : un commercial l'a révoqué
 * pendant le téléchargement. La composition ne trouve plus rien à imprimer.
 */
class VanishingDraft extends InMemoryMandates {
  override findAwaitingProof(): Promise<PaymentMandate | null> {
    return Promise.resolve(null);
  }
}

function harness(
  options: {
    readonly role?: BankAccountRole | null;
    readonly open?: boolean;
    readonly mandates?: InMemoryMandates;
  } = {},
) {
  const steps = new Steps();
  const mandates = options.mandates ?? new InMemoryMandates(steps);
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount();
  const handler = new GetMyCompanyMandateDocumentHandler(
    new FixedGuard(steps, options.role === undefined ? "owner" : options.role),
    new FixedGate(steps, options.open ?? true),
    accounts,
    mandates,
    new FixedCreditors(),
    new NoLogo(),
    new MemoryStore(steps),
  );
  return {
    mandates,
    accounts,
    run: () => handler.execute(new GetMyCompanyMandateDocumentQuery("usr_1", "cmp_1")),
  };
}

describe("GetMyCompanyMandateDocumentHandler — le mandat à signer", () => {
  it("imprime la RUM du brouillon, sans mention EXEMPLE", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    const pdf = await h.run();

    const text = drawnText(pdf.bytes);
    expect(text).toContain("LFC-9P2X4B-260914-K7M3QT");
    expect(text).not.toContain("EXEMPLE");
    expect(pdf.fileName).toBe("mandat-sepa-refuge-du-col-sarl.pdf");
  });

  /** Assumé par Hugo (2026-09-14) : un mandat EPC porte l'IBAN du débiteur. */
  it("porte l'IBAN entier du débiteur — assumé, c'est le document EPC", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    expect(drawnText((await h.run()).bytes).replace(/\s/gu, "")).toContain(
      "FR1420041010050500013M02606",
    );
  });

  it("refuse en 404 quand aucun brouillon n'existe, sans rien composer", async () => {
    await expect(harness().run()).rejects.toBeInstanceOf(MandateDocumentNotFoundError);
  });

  /** Plan §6 #4 : un actif ne se réimprime pas — un second exemplaire que personne n'a signé. */
  it("refuse en 404 pour un mandat actif", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateDocumentNotFoundError);
  });

  it("ne sert JAMAIS l'exemplaire, même si le brouillon disparaît en route", async () => {
    const mandates = new VanishingDraft(new Steps());
    mandates.draft = mandate();

    await expect(harness({ mandates }).run()).rejects.toBeInstanceOf(MandateDocumentNotFoundError);
  });

  it.each<BankAccountRole>(["admin", "orders"])("refuse %s en 403", async (role) => {
    const h = harness({ role });
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
  });

  it("refuse un non-membre en 404 d'appartenance, pas de document", async () => {
    const h = harness({ role: null });
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
  });

  it("refuse en 409 quand le drapeau est fermé, sans lire le RIB", async () => {
    const h = harness({ open: false });
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.accounts.reads).toBe(0);
  });
});
