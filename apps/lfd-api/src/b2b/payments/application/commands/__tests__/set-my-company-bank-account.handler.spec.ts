import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { InvalidIbanError } from "../../../../accounting/domain/errors/accounting-errors.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../../../domain/ports/bank-account-guard.reader.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BankAccountBoundToActiveMandateError } from "../../../domain/errors/mandate-errors.js";
import {
  activeMandate,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  RecordingNotifier,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
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

function build(role: BankAccountRole | null) {
  const steps = new Steps();
  const guard = new FixedGuard(role);
  const repo = new InMemoryBankAccounts(steps);
  const mandates = new InMemoryMandates(steps);
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const handler = new SetMyCompanyBankAccountHandler(
    guard,
    repo,
    new FixedIdGenerator("cba"),
    mandates,
    new FixedClock(new Date("2026-09-14T09:00:00.000Z")),
    events,
    new StepUnitOfWork(steps),
    notifier,
  );
  return { handler, guard, repo, mandates, events, notifier };
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

  /**
   * Plan mandat client §8 (2026-09-14) : le papier signé nomme ce compte ; le
   * changement de banque passe par le staff.
   */
  it("refuse en 409 tant qu'un mandat est actif, sans lire ni écrire le RIB", async () => {
    const { handler, repo, mandates } = build("owner");
    mandates.current = activeMandate();

    await expect(
      handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(BankAccountBoundToActiveMandateError);
    expect(repo.reads).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  it("oppose le mur AVANT le mandat actif : un non-membre reçoit 404, pas 409", async () => {
    const { handler, mandates } = build(null);
    mandates.current = activeMandate();

    await expect(
      handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
  });

  /** Un brouillon ne bloque pas : il est révoqué, et le client régénère. */
  it("accepte le RIB quand un BROUILLON existe, et le révoque en le traçant", async () => {
    const { handler, repo, mandates, events, notifier } = build("billing");
    mandates.draft = mandate();

    await handler.execute(new SetMyCompanyBankAccountCommand("usr_1", "cmp_1", PAYLOAD));

    expect(repo.saved).toHaveLength(1);
    expect(mandates.saved.map((saved) => saved.status)).toEqual(["revoked"]);
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.draft_voided",
    ]);
    expect(notifier.notices).toHaveLength(1);
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
