import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SiteDebitsPayerAccountError } from "../../../domain/errors/sub-account-mandate-errors.js";
import {
  CREDITOR,
  FixedCreditors,
  FixedDebtors,
  FixedGate,
  FixedGuard,
  FixedSecrets,
  HOLDER,
  InMemoryBankAccounts,
  InMemoryMandates,
  StepPublisher,
  Steps,
  StepUnitOfWork,
  bankAccount,
} from "../../__tests__/payment-doubles.js";
import { RecordingFirstMandateLedger } from "../../__tests__/recording-first-mandate-ledger.js";
import { MintMandateCommand } from "../mint-mandate.command.js";
import { MintMandateHandler } from "../mint-mandate.handler.js";
import { MintMyCompanyMandateCommand } from "../mint-my-company-mandate.command.js";
import { MintMyCompanyMandateHandler } from "../mint-my-company-mandate.handler.js";

// Comparée à aucune horloge : la frappe n'en tire que la date de la RUM.
const NOW = new Date("2026-09-15T09:00:00.000Z");

const PRINCIPAL = { companyId: "alpes", name: "Alpes Chalets Privés" } as const;

/**
 * Un chalet sans SIREN, facturé à son principal : la frappe lit l'identité
 * RÉSOLUE (plan-sous-comptes §2.1 ter, T9), et un mandat de site fige le
 * principal comme débiteur et le compte qu'il débite.
 */
function site(options: { readonly ownIban?: boolean } = {}) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  // Le site n'a ni raison sociale ni SIREN : ses mentions sont celles du principal.
  mandates.holder = { ...HOLDER, companyName: "", siren: "" };
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = bankAccount(options.ownIban === true ? "cmp_1" : PRINCIPAL.companyId);
  const debtors = new FixedDebtors(mandates);
  debtors.billedTo = PRINCIPAL;
  debtors.ownIban = options.ownIban ?? false;
  return { steps, mandates, accounts, debtors };
}

describe("La frappe d'un mandat de site (staff)", () => {
  function staffMint(scene: ReturnType<typeof site>) {
    return new MintMandateHandler(
      scene.mandates,
      new FixedCreditors(CREDITOR),
      new FixedClock(NOW),
      new FixedSecrets(),
      scene.accounts,
      new StepPublisher(scene.steps),
      new StepUnitOfWork(scene.steps),
      new RecordingFirstMandateLedger(),
      scene.debtors,
    ).execute(new MintMandateCommand("cmp_1"));
  }

  it("ne bloque pas sur le SIREN d'un site : le mandat nomme le principal", async () => {
    const scene = site();

    await staffMint(scene);

    const [created] = scene.mandates.created;
    expect(created?.companyId).toBe("cmp_1");
    expect(created?.debtor).toEqual({
      companyId: "alpes",
      siren: "552100554",
      name: "Alpes Chalets Privés",
      legalForm: "SAS",
    });
  });

  it("fige le compte débité : celui du RIB lu — du principal, ou le sien en RIB propre", async () => {
    const scene = site({ ownIban: true });

    await staffMint(scene);

    expect(scene.mandates.created[0]?.bankAccountId).toBe("cba_1");
    expect(scene.mandates.created[0]?.debtor?.companyId).toBe("alpes");
  });
});

describe("La frappe d'un mandat de site (client) — §3", () => {
  function clientMint(scene: ReturnType<typeof site>) {
    return new MintMyCompanyMandateHandler(
      new FixedGuard(scene.steps, "owner"),
      new FixedGate(scene.steps, true),
      scene.mandates,
      scene.accounts,
      new FixedCreditors(),
      new FixedClock(NOW),
      new FixedSecrets(),
      new StepPublisher(scene.steps),
      new StepUnitOfWork(scene.steps),
      new RecordingFirstMandateLedger(scene.steps),
      scene.debtors,
    ).execute(new MintMyCompanyMandateCommand("usr_1", "cmp_1"));
  }

  it("refuse depuis l'espace du site quand il débite le compte du principal, sans rien frapper", async () => {
    const scene = site();

    await expect(clientMint(scene)).rejects.toBeInstanceOf(SiteDebitsPayerAccountError);
    await expect(clientMint(scene)).rejects.toThrow(/Alpes Chalets Privés/u);
    expect(scene.mandates.created).toEqual([]);
  });

  it("laisse un site en RIB propre préparer son mandat — le compte est le sien", async () => {
    const scene = site({ ownIban: true });

    await clientMint(scene);

    expect(scene.mandates.created).toHaveLength(1);
  });
});
