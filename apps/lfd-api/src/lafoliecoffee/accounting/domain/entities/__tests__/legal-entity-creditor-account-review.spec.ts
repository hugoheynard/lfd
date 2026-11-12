import {
  CreditorIdentityIsFrozenError,
  InvalidLegalEntityError,
} from "../../errors/accounting-errors.js";
import {
  CreditorAccountIbanMismatchError,
  CreditorAccountSelfConfirmationError,
  PendingCreditorAccountGoneError,
} from "../../errors/creditor-account-review-errors.js";
import { Bic } from "../../value-objects/bic.js";
import { CreditorAccount } from "../../value-objects/creditor-account.js";
import { CreditorIdentifier } from "../../value-objects/creditor-identifier.js";
import { Iban } from "../../value-objects/iban.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { PendingCreditorAccount } from "../../value-objects/pending-creditor-account.js";
import { Siren } from "../../value-objects/siren.js";
import { LegalEntity } from "../legal-entity.js";

/** IBAN d'exemple de la documentation EPC — clé mod-97 valide. */
const OLD_IBAN = "FR1420041010050500013M02606";
const NEW_IBAN = "FR7630006000011234567890189";
/** Un troisième IBAN valide, pour une proposition qui en remplace une autre. */
const OTHER_IBAN = "FR7630004000031234567890143";

const AUTHOR = "staff_author";
const CONFIRMER = "staff_confirmer";
const PROPOSED_AT = new Date(0);

function accountWith(over: { iban?: string; holder?: string; bic?: string } = {}) {
  return CreditorAccount.create({
    holder: over.holder ?? "Crazeativity",
    address: LegalAddress.create({
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    }),
    iban: Iban.create(over.iban ?? OLD_IBAN),
    bic: Bic.create(over.bic ?? "CEPAFRPP751"),
  });
}

function proposal(id = "pending_1", staffId = AUTHOR) {
  return { id, staffId, at: PROPOSED_AT };
}

/** Une entité qui encaisse sur l'ancien compte, confirmé par sa première saisie. */
function collecting(): LegalEntity {
  const entity = LegalEntity.declare({
    id: "le1",
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
  });
  entity.assignCreditorIdentifier(CreditorIdentifier.create("FR72ZZZ123456"));
  entity.setCreditorAccount(accountWith(), proposal("first", AUTHOR));
  return entity;
}

/** La même entité, relue après la frappe d'un premier mandat. */
function frozen(entity: LegalEntity): LegalEntity {
  return LegalEntity.reconstitute({
    ...entity.toPersistence(),
    firstMandateIssuedAt: new Date("2026-09-12T08:00:00.000Z"),
  });
}

describe("LegalEntity — la première saisie du compte", () => {
  it("est prise tout de suite : rien n'encaisse encore, rien à détourner", () => {
    const entity = collecting();

    expect(entity.pendingCreditorAccount).toBeNull();
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
  });

  it("ne rend aucune proposition", () => {
    const entity = LegalEntity.reconstitute({
      ...collecting().toPersistence(),
      creditorIban: null,
      creditorBic: null,
    });

    expect(entity.setCreditorAccount(accountWith(), proposal())).toBeNull();
  });
});

describe("LegalEntity — une modification du compte attend un second membre", () => {
  it("devient une proposition, et le compte confirmé reste celui qu'on imprime", () => {
    const entity = collecting();

    const pending = entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());

    expect(pending).toBe(entity.pendingCreditorAccount);
    expect(pending?.proposedByStaffId).toBe(AUTHOR);
    expect(pending?.last4()).toBe("0189");
    // 🔴 Le seul point qui compte : factures, lot et mandat lisent ceci.
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
    expect(entity.toPersistence()).toMatchObject({
      creditorIban: OLD_IBAN,
      pendingCreditorIban: NEW_IBAN,
      pendingCreditorAccountId: "pending_1",
      pendingCreditorAccountProposedByStaffId: AUTHOR,
    });
  });

  it("porte le compte ENTIER : titulaire, adresse et BIC changés attendent aussi", () => {
    const entity = collecting();

    entity.setCreditorAccount(
      accountWith({ holder: "Crazeativity SAS", bic: "BNPAFRPP" }),
      proposal(),
    );

    expect(entity.creditorSnapshot()).toMatchObject({
      accountHolder: "Crazeativity",
      creditorBic: "CEPAFRPP751",
    });
  });

  it("une nouvelle saisie remplace celle qui attendait", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal("pending_1"));

    entity.setCreditorAccount(accountWith({ iban: OTHER_IBAN }), proposal("pending_2"));

    expect(entity.pendingCreditorAccount?.id).toBe("pending_2");
  });

  it("se relit telle quelle depuis la base", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());

    const reloaded = LegalEntity.reconstitute(entity.toPersistence());

    expect(reloaded.pendingCreditorAccount).toMatchObject({
      id: "pending_1",
      proposedByStaffId: AUTHOR,
      proposedAt: PROPOSED_AT,
    });
    expect(reloaded.pendingCreditorAccount?.account.iban.value).toBe(NEW_IBAN);
    expect(reloaded.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
  });
});

describe("LegalEntity — confirmer une modification du compte", () => {
  function proposed(): LegalEntity {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());
    return entity;
  }

  it("par un autre membre qui ressaisit le même IBAN : le compte change", () => {
    const entity = proposed();

    const confirmed = entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER);

    expect(confirmed.id).toBe("pending_1");
    expect(entity.pendingCreditorAccount).toBeNull();
    expect(entity.creditorSnapshot().creditorIban).toBe(NEW_IBAN);
  });

  it("accepte l'IBAN ressaisi avec espaces et en minuscules — c'est le même compte", () => {
    const entity = proposed();

    entity.confirmCreditorAccount(
      "pending_1",
      Iban.create("fr76 3000 6000 0112 3456 7890 189"),
      CONFIRMER,
    );

    expect(entity.creditorSnapshot().creditorIban).toBe(NEW_IBAN);
  });

  it("REFUSE l'auteur de la saisie, et rien ne change", () => {
    const entity = proposed();

    expect(() => entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), AUTHOR)).toThrow(
      CreditorAccountSelfConfirmationError,
    );
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
    expect(entity.pendingCreditorAccount?.id).toBe("pending_1");
  });

  it("REFUSE un IBAN ressaisi différent, sans dire où il diffère", () => {
    const entity = proposed();

    let refusal: unknown;
    try {
      entity.confirmCreditorAccount("pending_1", Iban.create(OTHER_IBAN), CONFIRMER);
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(CreditorAccountIbanMismatchError);
    const message = (refusal as Error).message;
    expect(message).not.toContain(NEW_IBAN);
    expect(message).not.toContain(OTHER_IBAN);
    expect(message).not.toContain("0189");
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
  });

  it("REFUSE une saisie remplacée entre-temps", () => {
    const entity = proposed();
    entity.setCreditorAccount(accountWith({ iban: OTHER_IBAN }), proposal("pending_2"));

    expect(() =>
      entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER),
    ).toThrow(PendingCreditorAccountGoneError);
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
  });

  it("REFUSE une saisie déjà confirmée — rejouer ne refait rien", () => {
    const entity = proposed();
    entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER);

    expect(() =>
      entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER),
    ).toThrow(PendingCreditorAccountGoneError);
  });

  it("REFUSE quand rien n'attend", () => {
    expect(() =>
      collecting().confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER),
    ).toThrow(PendingCreditorAccountGoneError);
  });

  it("refuse dès la proposition un titulaire changé après le premier mandat", () => {
    const entity = frozen(collecting());

    expect(() =>
      entity.setCreditorAccount(accountWith({ holder: "Autre Société" }), proposal()),
    ).toThrow(CreditorIdentityIsFrozenError);
    expect(entity.pendingCreditorAccount).toBeNull();
  });

  it("REFUSE de confirmer un titulaire changé si un mandat a été frappé depuis la saisie", () => {
    const before = collecting();
    before.setCreditorAccount(accountWith({ holder: "Autre Société" }), proposal());
    const entity = frozen(before);

    expect(() =>
      entity.confirmCreditorAccount("pending_1", Iban.create(OLD_IBAN), CONFIRMER),
    ).toThrow(CreditorIdentityIsFrozenError);
    expect(entity.creditorSnapshot().accountHolder).toBe("Crazeativity");
  });

  it("laisse confirmer un IBAN changé après le premier mandat — aucun mandat ne le porte", () => {
    const entity = frozen(collecting());
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());

    entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER);

    expect(entity.creditorSnapshot().creditorIban).toBe(NEW_IBAN);
  });
});

describe("LegalEntity — annuler une modification du compte", () => {
  it("retire la proposition, le compte confirmé ne bouge pas", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());

    const cancelled = entity.cancelPendingCreditorAccount("pending_1");

    expect(cancelled.id).toBe("pending_1");
    expect(entity.pendingCreditorAccount).toBeNull();
    expect(entity.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
  });

  it("une saisie annulée ne se confirme plus", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal());
    entity.cancelPendingCreditorAccount("pending_1");

    expect(() =>
      entity.confirmCreditorAccount("pending_1", Iban.create(NEW_IBAN), CONFIRMER),
    ).toThrow(PendingCreditorAccountGoneError);
  });

  it("REFUSE une saisie qui n'attend plus", () => {
    const entity = collecting();
    entity.setCreditorAccount(accountWith({ iban: NEW_IBAN }), proposal("pending_1"));
    entity.setCreditorAccount(accountWith({ iban: OTHER_IBAN }), proposal("pending_2"));

    expect(() => entity.cancelPendingCreditorAccount("pending_1")).toThrow(
      PendingCreditorAccountGoneError,
    );
    expect(() => collecting().cancelPendingCreditorAccount("pending_1")).toThrow(
      PendingCreditorAccountGoneError,
    );
  });
});

describe("LegalEntity — la version du verrou optimiste", () => {
  it("part de 0 à la déclaration et suit chaque écriture réussie", () => {
    const entity = collecting();
    expect(entity.version).toBe(0);

    entity.persistedAsNextVersion();

    expect(entity.version).toBe(1);
    expect(entity.toPersistence().version).toBe(1);
    expect(LegalEntity.reconstitute({ ...entity.toPersistence(), version: 7 }).version).toBe(7);
  });
});

describe("PendingCreditorAccount", () => {
  it("refuse une proposition sans auteur", () => {
    expect(() => PendingCreditorAccount.propose(accountWith(), proposal("pending_1", " "))).toThrow(
      InvalidLegalEntityError,
    );
  });
});
