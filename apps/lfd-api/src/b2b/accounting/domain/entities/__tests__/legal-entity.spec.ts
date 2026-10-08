import {
  CreditorIdentifierIsImmutableError,
  CreditorIdentityIsFrozenError,
  EntityCannotCollectError,
  InvalidLegalEntityError,
} from "../../errors/accounting-errors.js";
import { CollectionBeforeNoticeError } from "../../errors/collection-schedule-errors.js";
import { InvalidInvoicePaymentTermsError } from "../../errors/invoice-issuance-errors.js";
import { CreditorIdentifier } from "../../value-objects/creditor-identifier.js";
import { Bic } from "../../value-objects/bic.js";
import { CreditorAccount } from "../../value-objects/creditor-account.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Iban } from "../../value-objects/iban.js";
import { Siren } from "../../value-objects/siren.js";
import {
  LegalEntity,
  PRE_NOTIFICATION_DEFAULT_DAYS,
  PRE_NOTIFICATION_MAX_DAYS,
  type LegalEntityDeclaration,
} from "../legal-entity.js";

const ICS = CreditorIdentifier.create("FR72ZZZ123456");
const BIC = Bic.create("CEPAFRPP751");

/** Le RIB recopié — titulaire et adresse compris, comme sur le papier. */
function accountWith(over: { iban?: string; holder?: string; city?: string } = {}) {
  return CreditorAccount.create({
    holder: over.holder ?? "Crazeativity",
    address: LegalAddress.create({
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: over.city ?? "Val d'Isère",
      countryCode: "FR",
    }),
    iban: Iban.create(over.iban ?? "FR1420041010050500013M02606"),
    bic: BIC,
  });
}
const ACCOUNT = accountWith();

function declaration(overrides: Partial<LegalEntityDeclaration> = {}): LegalEntityDeclaration {
  return {
    id: "01JBXY000000000000000000LE",
    name: "La Folie Coffee",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue des Lilas",
      line2: "",
      postalCode: "75011",
      city: "Paris",
      countryCode: "FR",
    }),
    rcs: "Paris B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR40552100554",
    ...overrides,
  };
}

function collecting(): LegalEntity {
  const entity = LegalEntity.declare(declaration());
  entity.assignCreditorIdentifier(ICS);
  entity.setCreditorAccount(ACCOUNT);
  return entity;
}

describe("LegalEntity — déclaration", () => {
  it("naît sans coordonnées bancaires : l'ICS arrive des semaines plus tard", () => {
    const entity = LegalEntity.declare(declaration());
    expect(entity.canCollect()).toBe(false);
    expect(entity.toPersistence().ics).toBeNull();
    expect(entity.toPersistence().preNotificationDays).toBe(PRE_NOTIFICATION_DEFAULT_DAYS);
  });

  it("refuse une identité incomplète", () => {
    expect(() => LegalEntity.declare(declaration({ name: "  " }))).toThrow(InvalidLegalEntityError);
    expect(() => LegalEntity.declare(declaration({ legalForm: "" }))).toThrow(/Forme juridique/u);
  });

  it("refuse un capital qui n'est pas un entier de centimes positif", () => {
    expect(() => LegalEntity.declare(declaration({ shareCapitalCents: 10_000.5 }))).toThrow(
      /centimes/u,
    );
    expect(() => LegalEntity.declare(declaration({ shareCapitalCents: -1 }))).toThrow(
      InvalidLegalEntityError,
    );
  });

  it("normalise le numéro de TVA en majuscules", () => {
    const entity = LegalEntity.declare(declaration({ vatNumber: " fr40552100554 " }));
    expect(entity.toPersistence().vatNumber).toBe("FR40552100554");
  });
});

describe("LegalEntity — l'ICS ne se remplace pas", () => {
  it("accepte la même attribution deux fois : une saisie rejouée n'est pas une faute", () => {
    const entity = LegalEntity.declare(declaration());
    entity.assignCreditorIdentifier(ICS);
    expect(() =>
      entity.assignCreditorIdentifier(CreditorIdentifier.create("FR72ZZZ123456")),
    ).not.toThrow();
  });

  it("refuse un ICS différent — les mandats signés portent l'ancien", () => {
    const entity = LegalEntity.declare(declaration());
    entity.assignCreditorIdentifier(ICS);
    expect(() =>
      entity.assignCreditorIdentifier(CreditorIdentifier.create("FR72ZZZ999999")),
    ).toThrow(CreditorIdentifierIsImmutableError);
  });

  it("dit le geste de sortie dans le message : une seconde entité", () => {
    // Le back-office est lu par du personnel qui n'a pas le code sous les yeux.
    const entity = LegalEntity.declare(declaration());
    entity.assignCreditorIdentifier(ICS);
    expect(() =>
      entity.assignCreditorIdentifier(CreditorIdentifier.create("FR72ZZZ999999")),
    ).toThrow(/seconde entité juridique/u);
  });

  it("laisse en revanche changer de banque", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: "FR7630006000011234567890189" }));
    expect(entity.toPersistence().creditorIban).toBe("FR7630006000011234567890189");
  });
});

describe("LegalEntity — encaisser demande tout", () => {
  it("refuse le snapshot tant que l'ICS manque, en le nommant", () => {
    const entity = LegalEntity.declare(declaration());
    entity.setCreditorAccount(ACCOUNT);
    expect(() => entity.creditorSnapshot()).toThrow(EntityCannotCollectError);
    expect(() => entity.creditorSnapshot()).toThrow(/identifiant créancier/u);
  });

  it("refuse le snapshot tant que le compte manque", () => {
    const entity = LegalEntity.declare(declaration());
    entity.assignCreditorIdentifier(ICS);
    expect(() => entity.creditorSnapshot()).toThrow(/compte bancaire/u);
  });

  it("refuse d'encaisser sous une entité archivée", () => {
    const entity = collecting();
    entity.archive(new Date("2026-09-01T10:00:00.000Z"));
    expect(entity.canCollect()).toBe(false);
    expect(() => entity.creditorSnapshot()).toThrow(/archivée/u);
  });

  it("rend un émetteur complet, prêt à imprimer", () => {
    expect(collecting().creditorSnapshot()).toEqual({
      legalEntityId: "01JBXY000000000000000000LE",
      name: "La Folie Coffee",
      legalForm: "SAS",
      siren: "552100554",
      vatNumber: "FR40552100554",
      rcs: "Paris B 552 100 554",
      shareCapitalCents: 1_000_000,
      addressLines: ["12 rue des Lilas", "75011 Paris", "FR"],
      ics: "FR72ZZZ123456",
      // Les deux réglages de mandat, à leur état de déclaration : rien à dire du
      // contrat, et récurrent — le régime de l'immense majorité des mandats.
      mandateContractDescription: "",
      mandatePaymentType: "recurrent",
      mandateScheme: "B2B",
      creditorBic: "CEPAFRPP751",
      accountHolder: "Crazeativity",
      accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
      creditorIban: "FR1420041010050500013M02606",
      preNotificationDays: PRE_NOTIFICATION_DEFAULT_DAYS,
      collectionDaysAfterClosure: null,
    });
  });

  it("rend une COPIE : déménager ne réécrit pas un mandat déjà signé", () => {
    const entity = collecting();
    const signed = entity.creditorSnapshot();
    entity.moveTo(
      LegalAddress.create({
        line1: "3 avenue du Port",
        line2: "",
        postalCode: "33000",
        city: "Bordeaux",
        countryCode: "FR",
      }),
    );
    expect(signed.addressLines).toEqual(["12 rue des Lilas", "75011 Paris", "FR"]);
    expect(entity.creditorSnapshot().addressLines).toContain("33000 Bordeaux");
  });
});

describe("LegalEntity — le délai de pré-notification", () => {
  it("se règle par entité : c'est une négociation bancaire, pas un déploiement", () => {
    const entity = collecting();
    entity.setPreNotificationDays(2);
    expect(entity.creditorSnapshot().preNotificationDays).toBe(2);
  });

  it("refuse un délai nul, négatif, fractionnaire ou déraisonnable", () => {
    const entity = collecting();
    expect(() => entity.setPreNotificationDays(0)).toThrow(InvalidLegalEntityError);
    expect(() => entity.setPreNotificationDays(-3)).toThrow(InvalidLegalEntityError);
    expect(() => entity.setPreNotificationDays(1.5)).toThrow(/entier/u);
    expect(() => entity.setPreNotificationDays(PRE_NOTIFICATION_MAX_DAYS + 1)).toThrow(
      InvalidLegalEntityError,
    );
  });
});

describe("LegalEntity — le calendrier de prélèvement (PA1)", () => {
  const SCHEDULE = { delayHours: 1, daysAfterClosure: null, depositCutoff: null };

  it("se déclare sans automatisme, N = délai, cut-off à renseigner : rien ne change", () => {
    const written = collecting().toPersistence();
    expect(written).toMatchObject({
      autoCollectionEnabled: false,
      autoCollectionDelayHours: 1,
      collectionDaysAfterClosure: null,
      depositCutoffBusinessDays: null,
      depositCutoffTime: null,
    });
  });

  it("refuse une échéance N plus courte que le délai de pré-notification", () => {
    const entity = collecting();
    expect(() => entity.setCollectionSchedule({ ...SCHEDULE, daysAfterClosure: 4 })).toThrow(
      CollectionBeforeNoticeError,
    );
    expect(entity.collectionSchedule.daysAfterClosure).toBeNull();
  });

  it("refuse de porter le délai de pré-notification au-dessus d'un N réglé — l'autre sens", () => {
    const entity = collecting();
    entity.setPreNotificationDays(4);
    entity.setCollectionSchedule({ ...SCHEDULE, daysAfterClosure: 4 });

    expect(() => entity.setPreNotificationDays(5)).toThrow(/clôture \+ 4 jours.*5 jours/su);
    expect(entity.creditorSnapshot().preNotificationDays).toBe(4);
  });

  it("laisse le délai monter librement quand N n'est pas réglé — il le suit", () => {
    const entity = collecting();
    entity.setPreNotificationDays(30);
    expect(entity.creditorSnapshot()).toMatchObject({
      preNotificationDays: 30,
      collectionDaysAfterClosure: null,
    });
  });

  it("dit si le calendrier a changé : une saisie rejouée n'est pas un fait", () => {
    const entity = collecting();
    const cutoff = { businessDaysBefore: 2, time: "16:00" };
    expect(entity.setCollectionSchedule({ ...SCHEDULE, depositCutoff: cutoff })).toBe(true);
    expect(entity.setCollectionSchedule({ ...SCHEDULE, depositCutoff: { ...cutoff } })).toBe(false);
  });

  it("active et désactive l'automatisme, et dit si l'état a changé", () => {
    const entity = collecting();
    expect(entity.setAutoCollection(false)).toBe(false);
    expect(entity.setAutoCollection(true)).toBe(true);
    expect(entity.autoCollectionEnabled).toBe(true);
  });

  it("relit ses réglages sans rien perdre", () => {
    const entity = collecting();
    entity.setAutoCollection(true);
    entity.setCollectionSchedule({
      delayHours: 3,
      daysAfterClosure: 20,
      depositCutoff: { businessDaysBefore: 2, time: "16:00" },
    });
    const written = entity.toPersistence();
    expect(LegalEntity.reconstitute(written).toPersistence()).toEqual(written);
  });
});

describe("LegalEntity — les mentions de paiement de la facture (E0)", () => {
  const TERMS = {
    latePenaltyRateBasisPoints: 1_415,
    recoveryIndemnityCents: 4_000,
    earlyPaymentDiscount: "néant",
  };

  it("déclarée, rien n'est posé d'office : tout est à renseigner", () => {
    const entity = LegalEntity.declare(declaration());
    expect(entity.paymentTerms.missing()).toHaveLength(3);
    expect(entity.toPersistence()).toMatchObject({
      invoiceLatePenaltyRateBasisPoints: null,
      invoiceRecoveryIndemnityCents: null,
      invoiceEarlyPaymentDiscount: null,
    });
  });

  it("se règle, dit si quelque chose a changé, et fait l'aller-retour", () => {
    const entity = collecting();
    expect(entity.setInvoicePaymentTerms(TERMS)).toBe(true);
    expect(entity.setInvoicePaymentTerms(TERMS)).toBe(false);
    const written = entity.toPersistence();
    expect(written.invoiceLatePenaltyRateBasisPoints).toBe(1_415);
    expect(LegalEntity.reconstitute(written).paymentTerms.equals(entity.paymentTerms)).toBe(true);
  });

  it("refuse une valeur hors bornes sans toucher aux mentions en place", () => {
    const entity = collecting();
    entity.setInvoicePaymentTerms(TERMS);
    expect(() =>
      entity.setInvoicePaymentTerms({ ...TERMS, latePenaltyRateBasisPoints: 0 }),
    ).toThrow(InvalidInvoicePaymentTermsError);
    expect(entity.paymentTerms.latePenaltyRateBasisPoints).toBe(1_415);
  });

  it("rend ses faits vendeur à plat, archivage compris", () => {
    const entity = collecting();
    entity.archive(new Date("2026-09-01T10:00:00.000Z"));
    expect(entity.invoiceSellerFacts()).toMatchObject({
      legalEntityId: entity.id,
      name: entity.name,
      archived: true,
    });
  });
});

describe("LegalEntity — relecture", () => {
  it("fait l'aller-retour sans rien perdre", () => {
    const entity = collecting();
    entity.setPreNotificationDays(3);
    const written = entity.toPersistence();
    expect(LegalEntity.reconstitute(written).toPersistence()).toEqual(written);
  });

  it("revalide les value objects : une ligne abîmée ne se rehydrate pas", () => {
    const written = collecting().toPersistence();
    expect(() => LegalEntity.reconstitute({ ...written, siren: "552100555" })).toThrow(
      /clé de contrôle/u,
    );
    expect(() => LegalEntity.reconstitute({ ...written, creditorIban: "FR00" })).toThrow(/IBAN/u);
  });

  it("restaure une entité archivée", () => {
    const entity = collecting();
    entity.archive(new Date("2026-09-01T10:00:00.000Z"));
    entity.restore();
    expect(entity.archived).toBe(false);
    expect(entity.canCollect()).toBe(true);
  });
});

describe("LegalEntity — le logo", () => {
  it("est absent à la déclaration, et l'absence est un état normal", () => {
    const entity = collecting();
    expect(entity.hasLogo).toBe(false);
    expect(entity.logoKey).toBeNull();
  });

  it("s'attache, se remplace et se retire par des méthodes MÉTIER", () => {
    const entity = collecting();

    entity.attachLogo("legal-entities/le1/logo");
    expect(entity.hasLogo).toBe(true);
    expect(entity.logoKey).toBe("legal-entities/le1/logo");

    entity.attachLogo("legal-entities/le1/logo-2");
    expect(entity.logoKey).toBe("legal-entities/le1/logo-2");

    entity.detachLogo();
    expect(entity.hasLogo).toBe(false);
    expect(entity.logoKey).toBeNull();
  });

  it("refuse une clé vide — une clé blanche pointerait vers le bucket entier", () => {
    expect(() => collecting().attachLogo("   ")).toThrow(/Clé de stockage du logo/u);
  });

  /**
   * 🔴 Le logo ne conditionne RIEN. Une entité sans logo prélève : son mandat
   * sort seulement sans rond. Le ranger dans `missingToCollect()` bloquerait
   * l'encaissement sur un défaut décoratif.
   */
  it("ne conditionne ni canCollect ni missingToCollect", () => {
    const entity = collecting();
    expect(entity.hasLogo).toBe(false);
    expect(entity.canCollect()).toBe(true);
    expect(entity.missingToCollect()).toEqual([]);
  });

  it("s'attache même sur une entité archivée — remettre un rond n'est pas une émission", () => {
    const entity = collecting();
    entity.archive(new Date("2026-09-01T10:00:00.000Z"));
    expect(() => entity.attachLogo("legal-entities/le1/logo")).not.toThrow();
  });
});

/**
 * Le gel du créancier imprimé — même raisonnement que l'immuabilité de l'ICS,
 * appliqué à ce que le PAPIER porte.
 *
 * 🔴 L'asymétrie est le sujet : un mandat SEPA imprime le titulaire, son adresse
 * et l'ICS. Il n'imprime **pas** l'IBAN du créancier. Changer de banque ne
 * contredit donc aucune signature, alors que changer de nom dit au débiteur
 * qu'il a autorisé quelqu'un d'autre (posé le 2026-09-12).
 */
describe("LegalEntity — le créancier imprimé gèle au premier mandat", () => {
  function withAccount(): LegalEntity {
    const entity = LegalEntity.declare(declaration());
    entity.assignCreditorIdentifier(ICS);
    entity.setCreditorAccount(ACCOUNT);
    return entity;
  }

  /**
   * L'entité telle que la relit la base après une frappe. L'agrégat ne pose plus
   * le verrou lui-même : `FirstMandateLedger` l'écrit en base, sous condition,
   * dans la transaction de la frappe (plan `plan-restes-du-mandat.md` §7 #6).
   * Son idempotence s'éprouve donc en e2e, là où elle vit.
   */
  function frozen(entity: LegalEntity): LegalEntity {
    return LegalEntity.reconstitute({
      ...entity.toPersistence(),
      firstMandateIssuedAt: new Date("2026-09-12T08:00:00.000Z"),
    });
  }

  it("se corrige librement TANT QU'AUCUN mandat n'est frappé", () => {
    const entity = withAccount();

    entity.setCreditorAccount(accountWith({ holder: "Crazeativity SAS" }));

    expect(entity.toPersistence().creditorAccountHolder).toBe("Crazeativity SAS");
    expect(entity.creditorIdentityFrozen).toBe(false);
  });

  it("refuse de changer le TITULAIRE une fois le premier mandat frappé", () => {
    const entity = frozen(withAccount());

    expect(() => entity.setCreditorAccount(accountWith({ holder: "Autre Société" }))).toThrow(
      CreditorIdentityIsFrozenError,
    );
  });

  it("refuse aussi de changer l'ADRESSE : elle est imprimée à côté du nom", () => {
    const entity = frozen(withAccount());

    expect(() => entity.setCreditorAccount(accountWith({ city: "Tignes" }))).toThrow(
      CreditorIdentityIsFrozenError,
    );
  });

  /** Le cas qui distingue cette règle de celle de l'ICS : on change de banque. */
  it("LAISSE changer d'IBAN après le premier mandat — aucun mandat ne le porte", () => {
    const entity = frozen(withAccount());

    entity.setCreditorAccount(accountWith({ iban: "FR7630006000011234567890189" }));

    expect(entity.toPersistence().creditorIban).toBe("FR7630006000011234567890189");
  });

  it("nomme l'ancien créancier ET le nouveau, pour qu'on sache lequel est sur le papier", () => {
    const entity = frozen(withAccount());

    expect(() => entity.setCreditorAccount(accountWith({ holder: "Autre Société" }))).toThrow(
      /Crazeativity.*Autre Société/su,
    );
  });

  it("dit la sortie : une seconde entité, pas une correction en douce", () => {
    const entity = frozen(withAccount());

    expect(() => entity.setCreditorAccount(accountWith({ holder: "Autre Société" }))).toThrow(
      /seconde entité juridique/u,
    );
  });

  it("se relit gelée depuis la base — le verrou survit au rechargement", () => {
    const entity = frozen(withAccount());

    const reloaded = LegalEntity.reconstitute(entity.toPersistence());

    expect(reloaded.creditorIdentityFrozen).toBe(true);
    expect(() => reloaded.setCreditorAccount(accountWith({ holder: "Autre" }))).toThrow(
      CreditorIdentityIsFrozenError,
    );
  });

  /**
   * Le premier compte posé APRÈS un mandat n'a rien à contredire : il n'y avait
   * pas de nom imprimé avant lui. Refuser là ferait un cul-de-sac.
   */
  it("laisse POSER un premier compte même si un mandat existe déjà", () => {
    const declared = LegalEntity.declare(declaration());
    declared.assignCreditorIdentifier(ICS);
    const entity = frozen(declared);

    expect(() => entity.setCreditorAccount(ACCOUNT)).not.toThrow();
  });
});
