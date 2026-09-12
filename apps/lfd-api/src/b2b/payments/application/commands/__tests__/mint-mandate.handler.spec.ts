import { NoIssuerError } from "../../../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../../../accounting/domain/ports/creditor.reader.js";
import type { CreditorSnapshot } from "../../../../accounting/domain/creditor-snapshot.js";
import type { Clock } from "../../../../../platform/time/clock.js";
import type { SecretGenerator } from "../../../../../platform/secret/secret-generator.js";
import {
  CompanyNotFoundForMandateError,
  MandateDraftAlreadyExistsError,
} from "../../../domain/errors/mandate-errors.js";
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
};

const HOLDER: MandateHolder = {
  companyName: "SAS Les Tommeuses",
  email: "x@y.fr",
  reference: "C-9P2X4B",
};

function build(
  options: {
    readonly holder?: MandateHolder | null;
    readonly issuer?: CreditorSnapshot | null;
    readonly draft?: PaymentMandate | null;
  } = {},
) {
  const written: MandateToCreate[] = [];

  // 🔴 Les deux doublés implémentent le port EN ENTIER, sans cast. Un
  // `as unknown as` laisserait la signature changer sans que rien ne rougisse —
  // le test resterait vert en éprouvant un port qui n'existe plus.
  const mandates: PaymentMandateRepository = {
    findHolder: () => Promise.resolve(options.holder === undefined ? HOLDER : options.holder),
    findDraft: () => Promise.resolve(options.draft ?? null),
    findCurrent: () => Promise.resolve(null),
    findById: () => Promise.resolve(null),
    create: (snapshot: MandateToCreate) => {
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

  return { handler: new MintMandateHandler(mandates, creditors, clock, secrets), written };
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
      ...mintMandate({ companyId: "cmp_1", creditorId: "ent_1", reference: "LFC-DEJA-LA" }),
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
