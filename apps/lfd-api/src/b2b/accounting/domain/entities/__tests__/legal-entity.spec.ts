import {
  CreditorIdentifierIsImmutableError,
  EntityCannotCollectError,
  InvalidLegalEntityError,
} from "../../errors/accounting-errors.js";
import { CreditorIdentifier } from "../../value-objects/creditor-identifier.js";
import { Iban } from "../../value-objects/iban.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Siren } from "../../value-objects/siren.js";
import {
  LegalEntity,
  PRE_NOTIFICATION_DEFAULT_DAYS,
  PRE_NOTIFICATION_MAX_DAYS,
  type LegalEntityDeclaration,
} from "../legal-entity.js";

const ICS = CreditorIdentifier.create("FR72ZZZ123456");
const ACCOUNT = Iban.create("FR1420041010050500013M02606");

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
    entity.setCreditorAccount(Iban.create("FR7630006000011234567890189"));
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
      creditorIban: "FR1420041010050500013M02606",
      preNotificationDays: PRE_NOTIFICATION_DEFAULT_DAYS,
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
