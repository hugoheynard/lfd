import {
  MandateDraftVoidedEvent,
  MandateMintedEvent,
  MandateOptionsChangedEvent,
  MandateProofAttachedEvent,
  MandateSignedEvent,
} from "../payment-mandate.events.js";

describe("les faits du mandat — ce que le journal retient", () => {
  it("nomme chaque geste sur le mandat, sujet compris", () => {
    const facts = [
      new MandateMintedEvent("mdt_1", "cmp_1", "RUM-1", "customer"),
      new MandateProofAttachedEvent("mdt_1", "cmp_1", "RUM-1", "scan.pdf", "staff"),
      new MandateSignedEvent("mdt_1", "cmp_1", "RUM-1", "2026-09-10", "mdt_0"),
      new MandateDraftVoidedEvent("mdt_1", "cmp_1", "RUM-1", "bank_account_changed", "staff"),
    ].map((event) => event.journalFact());

    expect(facts.map((fact) => fact.type)).toEqual([
      "payment_mandate.minted",
      "payment_mandate.proof_attached",
      "payment_mandate.signed",
      "payment_mandate.draft_voided",
    ]);
    for (const fact of facts) {
      expect(fact).toMatchObject({ subjectType: "payment_mandate", subjectId: "mdt_1" });
      expect(fact.payload).toMatchObject({ companyId: "cmp_1", reference: "RUM-1" });
    }
  });

  /** Le journal se relit des années après : aucune coordonnée bancaire n'y entre. */
  it("ne porte aucune clé qui dirait le compte", () => {
    const payloads = [
      new MandateMintedEvent("mdt_1", "cmp_1", "RUM-1", "staff"),
      new MandateProofAttachedEvent("mdt_1", "cmp_1", "RUM-1", "scan.pdf", "customer"),
      new MandateSignedEvent("mdt_1", "cmp_1", "RUM-1", "2026-09-10", null),
      new MandateDraftVoidedEvent("mdt_1", "cmp_1", "RUM-1", "mandate_options_changed", "customer"),
      new MandateOptionsChangedEvent("cba_1", "cmp_1", "C-9P2X4B", "CT-42", "customer"),
    ].map((event) => Object.keys(event.journalFact().payload));

    for (const keys of payloads) {
      expect(keys).not.toEqual(expect.arrayContaining(["iban"]));
      expect(keys).not.toEqual(expect.arrayContaining(["last4"]));
    }
  });

  /** Plan §10 (2026-09-14) : `draft_voided` ne disait pas qui avait réécrit. */
  it("dit qui a déclenché la révocation du brouillon", () => {
    const fact = new MandateDraftVoidedEvent(
      "mdt_1",
      "cmp_1",
      "RUM-1",
      "mandate_options_changed",
      "customer",
    ).journalFact();

    expect(fact.payload).toEqual({
      companyId: "cmp_1",
      reference: "RUM-1",
      cause: "mandate_options_changed",
      via: "customer",
    });
  });

  /** Aucun mandat n'existe forcément : le sujet est le RIB, qui porte les zones. */
  it("journalise les zones 14/19 sur le RIB, avec les valeurs écrites et `via`", () => {
    const fact = new MandateOptionsChangedEvent(
      "cba_1",
      "cmp_1",
      "C-9P2X4B",
      "CT-42",
      "staff",
    ).journalFact();

    expect(fact).toEqual({
      type: "payment_mandate.options_changed",
      subjectType: "company_bank_account",
      subjectId: "cba_1",
      payload: {
        companyId: "cmp_1",
        debtorReference: "C-9P2X4B",
        contractNumber: "CT-42",
        via: "staff",
      },
    });
  });
});
