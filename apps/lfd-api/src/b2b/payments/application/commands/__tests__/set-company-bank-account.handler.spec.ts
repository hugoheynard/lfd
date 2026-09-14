import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { InvalidIbanError } from "../../../../accounting/domain/errors/accounting-errors.js";
import type { IdGenerator } from "../../../../../platform/id/id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { MandateOptions } from "../../../domain/value-objects/mandate-options.js";
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
import { SetCompanyBankAccountCommand } from "../set-company-bank-account.command.js";
import { SetCompanyBankAccountHandler } from "../set-company-bank-account.handler.js";

const IBAN = "FR1420041010050500013M02606";
const OTHER_IBAN = "DE89370400440532013000";
const NOW = new Date("2026-09-14T09:00:00.000Z");

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

class FixedIds implements IdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `cba_${String(this.count)}`;
  }
}

function build() {
  const steps = new Steps();
  const repo = new InMemoryBankAccounts(steps);
  const mandates = new InMemoryMandates(steps);
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const handler = new SetCompanyBankAccountHandler(
    repo,
    new FixedIds(),
    mandates,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
    notifier,
  );
  return { handler, repo, steps, mandates, events, notifier };
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
   * 🔴 Changer de banque ne change pas le contrat. Le remettre à zéro ferait
   * perdre une saisie que personne n'a demandé à effacer — et l'écran ne le
   * dirait pas.
   *
   * La zone 20 n'est plus éprouvée ici : elle est remontée sur l'entité
   * émettrice le 2026-09-12, et ce handler ne la voit plus (cf. le JSDoc de
   * `MandateOptions`).
   */
  it("ne touche PAS aux zones facultatives en remplaçant le RIB", async () => {
    const { handler, repo } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));
    repo.stored?.setOptions(
      MandateOptions.create({
        debtorReference: "C-9P2X4B",
        contractNumber: "CT-42",
      }),
    );

    await handler.execute(
      new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, iban: OTHER_IBAN }),
    );

    expect(repo.stored?.options.contractNumber).toBe("CT-42");
    expect(repo.stored?.account.iban.value).toBe(OTHER_IBAN);
  });

  /**
   * Plan mandat client §8 et §9 #4 (2026-09-14) : le brouillon imprime le RIB.
   * Signé après un changement, il nommerait un compte qui n'est plus le bon.
   */
  it("révoque le brouillon dans la MÊME unité de travail, trace, puis sonne", async () => {
    const { handler, steps, mandates, events, notifier } = build();
    mandates.draft = mandate();

    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));

    expect(steps.log).toEqual([
      "mandate:find-draft",
      "uow:begin",
      "account:save",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
      "bell",
    ]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      cause: "bank_account_changed",
    });
    expect(notifier.notices[0]).toMatchObject({
      kind: "payment_mandate.draft_voided",
      subject: "Mandat à refaire — Refuge du Col SARL",
      link: "/comptes-clients/cmp_1/informations",
    });
  });

  /** « Toute écriture » (plan §9 #4) : même une correction de titulaire est imprimée. */
  it("révoque le brouillon sur une simple correction de titulaire", async () => {
    const { handler, repo, mandates } = build();
    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));
    mandates.draft = mandate();

    await handler.execute(
      new SetCompanyBankAccountCommand("cmp_1", { ...PAYLOAD, holder: "Refuge du Col SAS" }),
    );

    expect(mandates.saved.map((saved) => saved.status)).toEqual(["revoked"]);
    expect(repo.stored?.account.iban.value).toBe(IBAN);
  });

  it("ne révoque ni ne sonne quand aucun brouillon n'existe", async () => {
    const { handler, mandates, events, notifier } = build();

    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));

    expect(mandates.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
    expect(notifier.notices).toHaveLength(0);
  });

  /** Hors lot (plan §9 #5) : l'actif changé par le staff n'a pas encore de mécanisme. */
  it("ne touche PAS au mandat actif", async () => {
    const { handler, mandates } = build();
    mandates.current = activeMandate();

    await handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD));

    expect(mandates.saved).toHaveLength(0);
  });

  it("garde le RIB et la révocation quand la cloche tombe en panne", async () => {
    const { handler, repo, mandates, notifier } = build();
    mandates.draft = mandate();
    notifier.broken = true;

    await expect(
      handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD)),
    ).resolves.toBeUndefined();
    expect(repo.stored).not.toBeNull();
    expect(mandates.saved[0]?.status).toBe("revoked");
  });

  it("ne rend rien — CQRS, le client relit", async () => {
    const { handler } = build();
    await expect(
      handler.execute(new SetCompanyBankAccountCommand("cmp_1", PAYLOAD)),
    ).resolves.toBeUndefined();
  });
});
