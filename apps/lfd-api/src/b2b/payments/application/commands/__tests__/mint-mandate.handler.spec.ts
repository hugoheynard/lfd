import {
  EntityCannotCollectError,
  SeveralIssuersError,
} from "../../../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../../../accounting/domain/ports/creditor.reader.js";
import type { CreditorSnapshot } from "../../../../accounting/domain/creditor-snapshot.js";
import type { Clock } from "../../../../../platform/time/clock.js";
import type { SecretGenerator } from "../../../../../platform/secret/secret-generator.js";
import {
  CompanyNotFoundForMandateError,
  MandateDraftAlreadyExistsError,
} from "../../../domain/errors/mandate-errors.js";
import { MandateMentionsMissingError } from "../../../domain/errors/mint-blocker-errors.js";
import type { MintBlocker } from "../../../domain/services/mint-blockers.js";
import {
  bankAccount,
  InMemoryBankAccounts,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { RecordingFirstMandateLedger } from "../../__tests__/recording-first-mandate-ledger.js";
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
  siren: "732829320",
};

function build(
  options: {
    readonly holder?: MandateHolder | null;
    readonly issuer?: CreditorSnapshot | null;
    readonly draft?: PaymentMandate | null;
    readonly withAccount?: boolean;
    /** Le refus de configuration que lève `soleIssuer` (entité incomplète, en double). */
    readonly issuerRefusal?: Error;
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
    depositProof: () => Promise.resolve(),
  };

  const issuer = options.issuer === undefined ? CREDITOR : options.issuer;
  const creditors: CreditorReader = {
    snapshot: () => Promise.resolve(issuer),
    soleIssuer: () =>
      options.issuerRefusal === undefined
        ? Promise.resolve(issuer)
        : Promise.reject(options.issuerRefusal),
  };

  const clock: Clock = { now: () => NOW };
  const secrets: SecretGenerator = { next: () => "K7M3QT9Z" };

  const accounts = new InMemoryBankAccounts(steps);
  if (options.withAccount ?? true) {
    accounts.stored = bankAccount();
  }
  const events = new StepPublisher(steps);
  const ledger = new RecordingFirstMandateLedger(steps);
  return {
    handler: new MintMandateHandler(
      mandates,
      creditors,
      clock,
      secrets,
      accounts,
      events,
      new StepUnitOfWork(steps),
      ledger,
    ),
    written,
    steps,
    events,
    ledger,
  };
}

describe("MintMandateHandler — frapper sans signer", () => {
  /**
   * Plan `plan-restes-du-mandat.md` §3 et §8 (lot B) : le verrou du créancier
   * imprimé et le mandat s'écrivent ensemble, ou pas du tout. Hors de la
   * transaction, un brouillon pourrait exister sous un créancier encore
   * corrigeable.
   */
  it("gèle le créancier imprimé DANS l'unité de travail, à l'instant de la frappe", async () => {
    const { handler, steps, ledger } = build();

    await handler.execute(new MintMandateCommand("cmp_1"));

    expect(steps.log).toEqual([
      "uow:begin",
      "mandate:create",
      "ledger:note",
      "journal:payment_mandate.minted",
      "uow:end",
    ]);
    expect(ledger.noted).toEqual([{ creditorId: "ent_1", at: NOW }]);
  });

  it("ne pose PAS le verrou quand la frappe est refusée", async () => {
    const { handler, ledger } = build({ issuer: null });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(
      MandateMentionsMissingError,
    );
    expect(ledger.noted).toHaveLength(0);
  });

  it("ne pose PAS le verrou quand l'index rend le brouillon d'un autre onglet", async () => {
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
    const { handler, ledger } = build({ raceWinner: winner });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow("LFC-GAGNANT");
    expect(ledger.noted).toHaveLength(0);
  });

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

    // `ledger:note` depuis le 2026-09-15 : le verrou du créancier imprimé part
    // dans la même transaction que le brouillon (plan restes du mandat §8).
    expect(steps.log).toEqual([
      "uow:begin",
      "mandate:create",
      "ledger:note",
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

    expect(await blockersOf(handler)).toEqual(["bank_account_missing"]);
    expect(written).toHaveLength(0);
  });

  /**
   * ⚠️ Ce test affirmait l'ORDRE « RIB avant émetteur » jusqu'au 2026-09-15.
   * Les mentions se refusent désormais ensemble : les dire une à une ferait
   * recommencer autant de fois qu'il en manque (plan mentions obligatoires §9).
   */
  it("nomme ensemble le RIB et l'émetteur manquants", async () => {
    const { handler } = build({ withAccount: false, issuer: null });

    expect(await blockersOf(handler)).toEqual(["bank_account_missing", "issuer_missing"]);
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

    expect(await blockersOf(handler)).toEqual(["issuer_missing"]);
  });

  it.each([
    ["incomplet", new EntityCannotCollectError(["ICS"])],
    ["en double", new SeveralIssuersError(2)],
  ])("dit « émetteur manquant » quand il est %s, sans rien frapper", async (_label, refusal) => {
    const { handler, written } = build({ issuerRefusal: refusal });

    expect(await blockersOf(handler)).toEqual(["issuer_missing"]);
    expect(written).toHaveLength(0);
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

/** Les codes du refus de frappe — l'échec du test si la frappe passe. */
async function blockersOf(handler: MintMandateHandler): Promise<readonly MintBlocker[]> {
  const refusal: unknown = await handler.execute(new MintMandateCommand("cmp_1")).then(
    () => null,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(MandateMentionsMissingError);
  return refusal instanceof MandateMentionsMissingError ? refusal.blockers : [];
}

/**
 * Plan `plan-mentions-obligatoires-du-mandat.md` §9 (2026-09-15) : le mandat
 * interentreprises exige le SIREN, la raison sociale du débiteur et la forme
 * juridique du titulaire. Le CORE, rien de plus qu'avant.
 */
describe("MintMandateHandler — les mentions obligatoires par schéma", () => {
  const bare = { ...HOLDER, companyName: "  ", siren: "" };

  it("refuse une frappe B2B sans raison sociale, SIREN ni forme juridique, et les nomme", async () => {
    const { handler, written } = build({ holder: bare, withAccount: false });

    expect(await blockersOf(handler)).toEqual([
      "bank_account_missing",
      "company_name_missing",
      "siren_missing",
    ]);
    expect(written).toHaveLength(0);
  });

  it("frappe en CORE sans raison sociale ni SIREN : ce formulaire ne les imprime pas", async () => {
    const { handler, written } = build({
      holder: bare,
      issuer: { ...CREDITOR, mandateScheme: "CORE" },
    });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).resolves.toBe("mdt_neuf");
    expect(written[0]?.scheme).toBe("CORE");
  });

  it("dit où saisir chaque mention, pour qui n'a pas le code sous les yeux", async () => {
    const { handler } = build({ holder: bare });

    await expect(handler.execute(new MintMandateCommand("cmp_1"))).rejects.toThrow(
      /SIREN de la société \(à saisir dans « Identité légale »\)/u,
    );
  });
});
