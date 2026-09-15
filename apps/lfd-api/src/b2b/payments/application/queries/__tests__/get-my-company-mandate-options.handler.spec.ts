import type { CreditorSnapshot } from "../../../../accounting/domain/creditor-snapshot.js";
import {
  EntityCannotCollectError,
  SeveralIssuersError,
} from "../../../../accounting/domain/errors/accounting-errors.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import { CustomerMandateClosedError } from "../../../domain/errors/mandate-errors.js";
import { MandateOptions } from "../../../domain/value-objects/mandate-options.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  bankAccount,
  bankAccountWithoutLegalForm,
  CREDITOR,
  FixedCreditors,
  FixedGate,
  FixedGuard,
  InMemoryBankAccounts,
  InMemoryMandates,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { GetMyCompanyMandateOptionsHandler } from "../get-my-company-mandate-options.handler.js";
import { GetMyCompanyMandateOptionsQuery } from "../get-my-company-mandate-options.query.js";

function harness(
  role: BankAccountRole | null = "owner",
  open = true,
  issuer: CreditorSnapshot | null = CREDITOR,
) {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  const handler = new GetMyCompanyMandateOptionsHandler(
    new FixedGuard(steps, role),
    new FixedGate(steps, open),
    accounts,
    new FixedCreditors(issuer),
    new InMemoryMandates(steps),
  );
  return {
    steps,
    accounts,
    run: () => handler.execute(new GetMyCompanyMandateOptionsQuery("usr_1", "cmp_1")),
  };
}

describe("GetMyCompanyMandateOptionsHandler — les zones 14 et 19 lues par le client", () => {
  it("rend des options nulles tant qu'aucun RIB n'est déposé", async () => {
    await expect(harness().run()).resolves.toMatchObject({ options: null });
  });

  it("rend les deux zones, et rien du compte", async () => {
    const h = harness("billing");
    const account = bankAccount();
    account.setOptions(MandateOptions.create({ debtorReference: "C-1", contractNumber: "CT-7" }));
    h.accounts.stored = account;

    const section = await h.run();

    expect(section.options).toEqual({ debtorReference: "C-1", contractNumber: "CT-7" });
  });

  it.each<BankAccountRole>(["admin", "orders"])("refuse %s en 403", async (role) => {
    await expect(harness(role).run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
  });

  it("refuse un non-membre en 404, avant de lire le drapeau", async () => {
    const h = harness(null, false);

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(h.steps.log).toEqual(["guard"]);
  });

  it("refuse en 409 quand le drapeau est fermé, sans lire le RIB", async () => {
    const h = harness("owner", false);

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.accounts.reads).toBe(0);
  });
});

/**
 * Plan mandat deux schémas §10, Q2 : l'écran masque la carte des zones quand
 * l'émetteur frappe en interentreprises, dont le formulaire ne les imprime pas.
 */
describe("GetMyCompanyMandateOptionsHandler — le schéma de l'émetteur", () => {
  it.each(["CORE", "B2B"] as const)("rend issuerScheme = %s, avec ou sans RIB", async (scheme) => {
    const h = harness("owner", true, { ...CREDITOR, mandateScheme: scheme });

    await expect(h.run()).resolves.toMatchObject({ options: null, issuerScheme: scheme });
  });

  it("rend issuerScheme = null sans émetteur actif", async () => {
    await expect(harness("owner", true, null).run()).resolves.toEqual({
      options: null,
      issuerScheme: null,
      mintBlockers: ["bank_account_missing", "issuer_missing"],
    });
  });
});

/**
 * Régression : l'émetteur lu pour `issuerScheme` levait tel quel ses refus de
 * configuration (entité incomplète, deux émetteurs), et l'écran Mon compte,
 * qui lit ces options à chaque ouverture, recevait un 409 pour une fiche staff
 * mal remplie (2026-09-15).
 */
describe("GetMyCompanyMandateOptionsHandler — un émetteur mal configuré ne casse pas la lecture", () => {
  it.each([
    ["incomplet", new EntityCannotCollectError(["ICS"])],
    ["en double", new SeveralIssuersError(2)],
  ])("rend issuerScheme = null quand l'émetteur est %s", async (_label, refusal) => {
    const creditors = {
      snapshot: () => Promise.resolve(null),
      soleIssuer: () => Promise.reject(refusal),
    };
    const handler = new GetMyCompanyMandateOptionsHandler(
      new FixedGuard(new Steps(), "owner"),
      new FixedGate(new Steps(), true),
      new InMemoryBankAccounts(new Steps()),
      creditors,
      new InMemoryMandates(new Steps()),
    );

    await expect(
      handler.execute(new GetMyCompanyMandateOptionsQuery("usr_1", "cmp_1")),
    ).resolves.toEqual({
      options: null,
      issuerScheme: null,
      mintBlockers: ["bank_account_missing", "issuer_missing"],
    });
  });
});

/** Plan mentions obligatoires §9 (2026-09-15) : l'écran sait quoi compléter avant de cliquer. */
describe("GetMyCompanyMandateOptionsHandler — ce qui empêche de générer", () => {
  it("rend une liste vide quand la génération passerait", async () => {
    const h = harness();
    h.accounts.stored = bankAccount();

    await expect(h.run()).resolves.toMatchObject({ issuerScheme: "B2B", mintBlockers: [] });
  });

  it("rend la forme juridique du titulaire manquante sous un émetteur B2B, pas sous CORE", async () => {
    const b2b = harness();
    b2b.accounts.stored = bankAccountWithoutLegalForm();
    const core = harness("owner", true, { ...CREDITOR, mandateScheme: "CORE" });
    core.accounts.stored = bankAccountWithoutLegalForm();

    await expect(b2b.run()).resolves.toMatchObject({ mintBlockers: ["holder_legal_form_missing"] });
    await expect(core.run()).resolves.toMatchObject({ mintBlockers: [] });
  });
});
