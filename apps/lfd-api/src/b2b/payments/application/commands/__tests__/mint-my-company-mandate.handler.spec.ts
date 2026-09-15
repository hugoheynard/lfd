import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  CustomerMandateClosedError,
  MandateAlreadyInForceError,
} from "../../../domain/errors/mandate-errors.js";
import { MandateMentionsMissingError } from "../../../domain/errors/mint-blocker-errors.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  activeMandate,
  bankAccount,
  bankAccountWithoutLegalForm,
  FixedCreditors,
  FixedGate,
  FixedGuard,
  FixedSecrets,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { MintMyCompanyMandateCommand } from "../mint-my-company-mandate.command.js";
import { MintMyCompanyMandateHandler } from "../mint-my-company-mandate.handler.js";

// Comparée à aucune horloge : c'est l'instant que la RUM doit porter.
const NOW = new Date("2026-09-14T09:00:00.000Z");

function harness(
  options: {
    readonly role?: BankAccountRole | null;
    readonly open?: boolean;
    readonly withAccount?: boolean;
    readonly issuer?: boolean;
  } = {},
) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  const accounts = new InMemoryBankAccounts(steps);
  if (options.withAccount ?? true) {
    accounts.stored = bankAccount();
  }
  const events = new StepPublisher(steps);
  const handler = new MintMyCompanyMandateHandler(
    new FixedGuard(steps, options.role === undefined ? "owner" : options.role),
    new FixedGate(steps, options.open ?? true),
    mandates,
    accounts,
    new FixedCreditors((options.issuer ?? true) ? undefined : null),
    new FixedClock(NOW),
    new FixedSecrets(),
    events,
    new StepUnitOfWork(steps),
  );
  const run = () => handler.execute(new MintMyCompanyMandateCommand("usr_1", "cmp_1"));
  return { steps, mandates, accounts, events, run };
}

describe("MintMyCompanyMandateHandler — le client génère son mandat", () => {
  it.each<BankAccountRole>(["owner", "billing"])(
    "laisse %s frapper un brouillon, tracé dans l'unité de travail",
    async (role) => {
      const h = harness({ role });

      await expect(h.run()).resolves.toBe("mdt_neuf");

      expect(h.mandates.created[0]?.status).toBe("draft");
      expect(h.mandates.created[0]?.reference).toContain("9P2X4B");
      expect(h.steps.log.slice(-4)).toEqual([
        "uow:begin",
        "mandate:create",
        "journal:payment_mandate.minted",
        "uow:end",
      ]);
      expect(h.events.traced[0]?.journalFact().payload).toEqual({
        companyId: "cmp_1",
        reference: h.mandates.created[0]?.reference,
        via: "customer",
      });
    },
  );

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s en 403, sans rien frapper",
    async (role) => {
      const h = harness({ role });

      await expect(h.run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
      expect(h.mandates.created).toHaveLength(0);
      expect(h.steps.log).toEqual(["guard"]);
    },
  );

  it("refuse un non-membre en 404, sans rien frapper", async () => {
    const h = harness({ role: null });

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(h.steps.log).toEqual(["guard"]);
  });

  it("refuse en 409 quand le drapeau est fermé, sans lire les mandats", async () => {
    const h = harness({ open: false });

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.steps.log).toEqual(["guard", "gate"]);
  });

  /** Décision de Hugo (2026-09-14) : pas de mandat sans le compte qu'il nomme. */
  it("refuse en 409 sans RIB, sans tirer de RUM", async () => {
    const h = harness({ withAccount: false });

    await expect(h.run()).rejects.toMatchObject({ blockers: ["bank_account_missing"] });
    expect(h.mandates.created).toHaveLength(0);
    expect(h.events.traced).toHaveLength(0);
  });

  /** ⚠️ Affirmait « RIB avant émetteur » jusqu'au 2026-09-15 : les mentions se disent ensemble. */
  it("nomme ensemble le RIB et l'émetteur manquants", async () => {
    const h = harness({ withAccount: false, issuer: false });

    await expect(h.run()).rejects.toMatchObject({
      blockers: ["bank_account_missing", "issuer_missing"],
    });
  });

  it("refuse quand aucune entité n'émet", async () => {
    const h = harness({ issuer: false });

    await expect(h.run()).rejects.toBeInstanceOf(MandateMentionsMissingError);
    expect(h.mandates.created).toHaveLength(0);
  });

  /** Plan mentions obligatoires §9 : le client est refusé comme le staff, avec les mêmes codes. */
  it("refuse une frappe B2B sans SIREN ni forme juridique du titulaire, sans rien frapper", async () => {
    const h = harness();
    h.mandates.holder = {
      companyName: "Refuge du Col SARL",
      email: "",
      reference: "C-9P2X4B",
      siren: "",
    };
    h.accounts.stored = bankAccountWithoutLegalForm();

    await expect(h.run()).rejects.toMatchObject({
      blockers: ["siren_missing", "holder_legal_form_missing"],
    });
    expect(h.mandates.created).toHaveLength(0);
  });

  /** Plan §6 #6 : le remplacement d'un actif reste un geste du staff. */
  it("refuse en 409 quand un mandat est déjà actif, sans rien frapper", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateAlreadyInForceError);
    expect(h.mandates.created).toHaveLength(0);
  });

  /** Plan §2 : un client qui recharge ne bute pas sur un 409. */
  it("rend le brouillon existant, sans en frapper un second ni tracer", async () => {
    const h = harness();
    h.mandates.draft = mandate({ id: "mdt_deja" });

    await expect(h.run()).resolves.toBe("mdt_deja");
    expect(h.mandates.created).toHaveLength(0);
    expect(h.events.traced).toHaveLength(0);
  });

  /**
   * Régression prévenue (plan §6 #5) : deux onglets passent tous deux la
   * lecture, l'index partiel refuse le second — qui remontait en 500.
   */
  it("rend le brouillon gagnant quand l'index tranche entre deux frappes", async () => {
    const h = harness();
    h.mandates.raceWinner = mandate({ id: "mdt_gagnant" });

    await expect(h.run()).resolves.toBe("mdt_gagnant");
  });
});
