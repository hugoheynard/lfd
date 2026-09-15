import { NoIssuerError } from "../../../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../../../accounting/domain/ports/creditor.reader.js";
import type { CreditorSnapshot } from "../../../../accounting/domain/creditor-snapshot.js";
import type { Clock } from "../../../../../platform/time/clock.js";
import type { SecretGenerator } from "../../../../../platform/secret/secret-generator.js";
import {
  CompanyNotFoundForMandateError,
  MandateDraftAlreadyExistsError,
  MandateWithoutBankAccountError,
} from "../../../domain/errors/mandate-errors.js";
import {
  bankAccount,
  InMemoryBankAccounts,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import {
  mintMandate,
  PaymentMandate,
  type MandateToCreate,
} from "../../../domain/entities/payment-mandate.js";
import type {
  MandateHolder,
  PaymentMandateRepository,
} from "../../../domain/payment-mandate.repository.js";
import { MintMandateCommand } from "../mint-mandate.command.js";
import { MintMandateHandler } from "../mint-mandate.handler.js";

const NOW = new Date("2026-09-12T09:00:00.000Z");

/** Un émetteur complet : le doublé implémente le port, il ne le mime pas. */
const CREDITOR: CreditorSnapshot = {
  legalEntityId: "ent_1",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  creditorIban: "FR7630006000011234567890189",
  creditorBic: "CEPAFRPP751",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
  preNotificationDays: 14,
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

const HOLDER: MandateHolder = {
  companyName: "SAS Les Tommeuses",
  email: "x@y.fr",
  reference: "C-9P2X4B",
  siret: "",
};

function build(
  options: {
    readonly holder?: MandateHolder | null;
    readonly issuer?: CreditorSnapshot | null;
    readonly draft?: PaymentMandate | null;
    readonly withAccount?: boolean;
    /** Le brouillon qu'un second onglet a frappé entre la lecture et l'écriture. */
    readonly raceWinner?: PaymentMandate;
  } = {},
) {
  const written: MandateToCreate[] = [];
  const steps = new Steps();
  let draft = options.draft ?? null;

  // 🔴 Les deux doublés implémentent le port EN ENTIER, sans cast. Un
  // `as unknown as` laisserait la signature changer sans que rien ne rougisse —
  // le test resterait vert en éprouvant un port qui n'existe plus.
  const mandates: PaymentMandateRepository = {
    findHolder: () => Promise.resolve(options.holder === undefined ? HOLDER : options.holder),
    findDraft: () => Promise.resolve(draft),
    findAwaitingProof: () => Promise.resolve(null),
    findCurrent: () => Promise.resolve(null),
    findById: () => Promise.resolve(null),
    create: (snapshot: MandateToCreate) => {
      if (options.raceWinner !== undefined) {
        draft = options.raceWinner;
        return Promise.reject(new MandateDraftAlreadyExistsError(null));
      }
      steps.log.push("mandate:create");
      written.push(snapshot);
      return Promise.resolve("mdt_neuf");
    },
    save: () => Promise.resolve(),
    findStripeCustomerId: () => Promise.resolve(null),
  };

  const creditors: CreditorReader = {
    snapshot: () => Promise.resolve(options.issuer === undefined ? CREDITOR : options.issuer),
    soleIssuer: () => Promise.resolve(options.issuer === undefined ? CREDITOR : options.issuer),
  };

  const clock: Clock = { now: () => NOW };
  const secrets: SecretGenerator = { next: () => "K7M3QT9Z" };

  const accounts = new InMemoryBankAccounts(steps);
  if (options.withAccount ?? true) {
    accounts.stored = bankAccount();
  }
  const events = new StepPublisher(steps);
  return {
    handler: new MintMandateHandler(
      mandates,
      creditors,
      clock,
      secrets,
      accounts,
      events,
      new StepUnitOfWork(steps),
    ),
    written,
    steps,
    events,
  };
}

describe("MintMandateHandler — frapper sans signer", () => {
  it("écrit un brouillon sans date de signature", async () => {
    const { handler, written } = build();

    await handler.execute(new MintMandateCommand("cmp_1"));

    expect(written).toHaveLength(1);
    expect(written[0]?.status).toBe("draft");
    expect(written[0]?.acceptedAt).toBeNull();
  });

  it("frappe une RUM qui porte la référence du client et la date du jour", async () => {
    const { handler, written } = build();

    await handler.execute(new MintMandateCommand("cmp_1"));

    // `LFC-9P2X4B-260912-K7M3QT` : préfixe, code client, frappe, tirage.
    expect(written[0]?.reference).toContain("9P2X4B");
    expect(written[0]?.reference).toContain("260912");
  });

  it("nomme l'entité émettrice — le papier l'oppose avec la RUM", async () => {
    const { handler, written } = build();

    await handler.execute(new MintMandateCommand("cmp_1"));

    expect(written[0]?.creditorId).toBe("ent_1");
  });

  /** Plan mandat client §9 #3 (2026-09-14) : la frappe s'écrit avec sa trace. */
  it("écrit le brouillon ET son fait dans la même unité de travail", async () => {
    const { handler, steps, events } = build();

    await handler.execute(new MintMandateCommand("cmp_1"));

    expect(steps.log).toEqual([
      "uow:begin",
      "mandate:create",
      "journal:payment_mandate.minted",
      "uow:end",
    ]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectId: "mdt_neuf",
      payload: { companyId: "cmp_1", via: "staff" },
    });
  });

  /**
   * 🔴 Décision de Hugo (2026-09-14) : la frappe exige un RIB, pour le staff
   * aussi. Ce spec affirmait l'inverse — « l'impression refusera ».
   */
  it("refuse en 409 sans RIB, sans tirer de RUM", async () => {
    const { handler, written } = build({ withAccount: false });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(
      MandateWithoutBankAccountError,
    );
    expect(written).toHaveLength(0);
  });

  it("oppose le RIB manquant avant l'émetteur manquant (société → RIB → émetteur)", async () => {
    const { handler } = build({ withAccount: false, issuer: null });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(
      MandateWithoutBankAccountError,
    );
  });

  /**
   * Régression prévenue (plan §6 #5) : deux clics simultanés passent tous deux
   * la lecture, et l'index partiel remontait en 500. Le staff garde son 409 —
   * qui nomme la RUM du brouillon gagnant, relue après la transaction.
   */
  it("nomme la RUM du brouillon gagnant quand l'index tranche", async () => {
    const winner = PaymentMandate.reconstitute({
      ...mintMandate({
        scheme: "B2B",
        paymentType: "recurrent",
        companyId: "cmp_1",
        creditorId: "ent_1",
        reference: "LFC-GAGNANT",
      }),
      id: "mdt_gagnant",
    });
    const { handler } = build({ raceWinner: winner });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow("LFC-GAGNANT");
  });

  it("refuse une société inconnue", async () => {
    const { handler } = build({ holder: null });

    await expect(handler.execute(new MintMandateCommand("cmp_x"))).rejects.toThrow(
      CompanyNotFoundForMandateError,
    );
  });

  it("refuse quand aucune entité ne peut émettre", async () => {
    const { handler } = build({ issuer: null });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(NoIssuerError);
  });

  /**
   * 🔴 L'invariant du double clic. L'index partiel `one_draft_per_company` tient
   * la règle pour de bon ; ce refus-ci existe pour qu'elle soit LISIBLE — sans
   * lui, la violation de contrainte remonte en « erreur inattendue ».
   */
  it("refuse un second brouillon, et nomme celui qui existe", async () => {
    const draft = PaymentMandate.reconstitute({
      ...mintMandate({
        scheme: "B2B",
        paymentType: "recurrent",
        companyId: "cmp_1",
        creditorId: "ent_1",
        reference: "LFC-DEJA-LA",
      }),
      id: "mdt_1",
    });
    const { handler, written } = build({ draft });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(
      MandateDraftAlreadyExistsError,
    );
    expect(written).toHaveLength(0);
  });

  /**
   * Régression : les trois gardes sont en AMONT du tirage. Une RUM fabriquée
   * puis jetée consommerait un tirage et porterait l'horodatage d'une frappe
   * qui n'a pas eu lieu.
   */
  it("ne frappe RIEN quand un refus est dû", async () => {
    const { handler, written } = build({ issuer: null });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow();
    expect(written).toHaveLength(0);
  });
});
