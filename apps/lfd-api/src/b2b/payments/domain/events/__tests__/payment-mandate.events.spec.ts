import {
  MandateDraftVoidedEvent,
  MandateMintedEvent,
  MandateOptionsChangedEvent,
  MandateProofAttachedEvent,
  MandateSentEvent,
  MandateSignedEvent,
} from "../payment-mandate.events.js";

/** La société engagée, nommée au moment du geste (lot B du plan des phrases). */
const COMPANY = { id: "cmp_1", name: "Café des Halles" };
/** La société telle que la charge la cite. */
const CITED = { id: "cmp_1", name: "Café des Halles" };

describe("les faits du mandat — ce que le journal retient", () => {
  it("nomme chaque geste sur le mandat, sujet compris", () => {
    const facts = [
      new MandateMintedEvent("mdt_1", COMPANY, "RUM-1", "customer"),
      new MandateProofAttachedEvent("mdt_1", COMPANY, "RUM-1", "scan.pdf", "staff"),
      new MandateSignedEvent("mdt_1", COMPANY, "RUM-1", "2026-09-10", {
        id: "mdt_0",
        name: "RUM-0",
      }),
      new MandateDraftVoidedEvent("mdt_1", COMPANY, "RUM-1", "bank_account_changed", "staff"),
      new MandateSentEvent("mdt_1", COMPANY, "RUM-1", "re_1"),
    ].map((event) => event.journalFact());

    expect(facts.map((fact) => fact.type)).toEqual([
      "payment_mandate.minted",
      "payment_mandate.proof_attached",
      "payment_mandate.signed",
      "payment_mandate.draft_voided",
      "payment_mandate.sent",
    ]);
    for (const fact of facts) {
      expect(fact).toMatchObject({ subjectType: "payment_mandate", subjectId: "mdt_1" });
      // Le mandat se nomme par sa RUM ; la société, par son nom du moment.
      expect(fact.payload).toMatchObject({
        subjectLabel: "RUM-1",
        company: CITED,
        reference: "RUM-1",
      });
    }
  });

  /** Le journal se relit des années après : aucune coordonnée bancaire n'y entre. */
  it("ne porte aucune clé qui dirait le compte", () => {
    const payloads = [
      new MandateMintedEvent("mdt_1", COMPANY, "RUM-1", "staff"),
      new MandateProofAttachedEvent("mdt_1", COMPANY, "RUM-1", "scan.pdf", "customer"),
      new MandateSignedEvent("mdt_1", COMPANY, "RUM-1", "2026-09-10", null),
      new MandateDraftVoidedEvent("mdt_1", COMPANY, "RUM-1", "mandate_options_changed", "customer"),
      new MandateOptionsChangedEvent(
        "cba_1",
        "Refuge du Col SARL",
        COMPANY,
        "C-9P2X4B",
        "CT-42",
        "customer",
      ),
    ].map((event) => Object.keys(event.journalFact().payload));

    for (const keys of payloads) {
      expect(keys).not.toEqual(expect.arrayContaining(["iban"]));
      expect(keys).not.toEqual(expect.arrayContaining(["last4"]));
    }
  });

  /** Décision de Hugo (2026-09-19) : l'envoi se relit par son reçu, jamais par l'adresse. */
  it("porte le reçu du fournisseur de l'envoi, et aucune adresse", () => {
    const fact = new MandateSentEvent("mdt_1", COMPANY, "RUM-1", null).journalFact();

    expect(fact.payload).toEqual({
      subjectLabel: "RUM-1",
      company: CITED,
      reference: "RUM-1",
      providerId: null,
    });
  });

  /** Plan §10 (2026-09-14) : `draft_voided` ne disait pas qui avait réécrit. */
  it("dit qui a déclenché la révocation du brouillon", () => {
    const fact = new MandateDraftVoidedEvent(
      "mdt_1",
      COMPANY,
      "RUM-1",
      "mandate_options_changed",
      "customer",
    ).journalFact();

    expect(fact.payload).toEqual({
      subjectLabel: "RUM-1",
      company: CITED,
      reference: "RUM-1",
      cause: "mandate_options_changed",
      via: "customer",
    });
  });

  /** Aucun mandat n'existe forcément : le sujet est le RIB, qui porte les zones. */
  it("journalise les zones 14/19 sur le RIB, avec les valeurs écrites et `via`", () => {
    const fact = new MandateOptionsChangedEvent(
      "cba_1",
      "Refuge du Col SARL",
      COMPANY,
      "C-9P2X4B",
      "CT-42",
      "staff",
    ).journalFact();

    expect(fact).toEqual({
      type: "payment_mandate.options_changed",
      subjectType: "company_bank_account",
      subjectId: "cba_1",
      payload: {
        // Le RIB se nomme par son titulaire, comme l'écran le montre.
        subjectLabel: "Refuge du Col SARL",
        company: CITED,
        debtorReference: "C-9P2X4B",
        contractNumber: "CT-42",
        via: "staff",
      },
    });
  });
});

describe("le mandat remplacé par une signature", () => {
  it("est cité par sa RUM, le nom que le client a sur l'ancien papier", () => {
    const fact = new MandateSignedEvent("mdt_1", COMPANY, "RUM-1", "2026-09-10", {
      id: "mdt_0",
      name: "RUM-0",
    }).journalFact();

    expect(fact.payload).toMatchObject({ replacedMandate: { id: "mdt_0", name: "RUM-0" } });
  });
});
