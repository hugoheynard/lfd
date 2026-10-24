import type { CarrierNote } from "@lfd/contracts";

import { DeliveryNote } from "../../entities/delivery-note.js";
import { DeliveryNoteWithoutTermsError } from "../../errors/delivery-note-errors.js";
import { carrierNoteOf, clientNoteOf, staffNoteOf } from "../delivery-note-sheet.js";
import {
  handedOverNote,
  HANDED_OVER_AT,
  HEAD,
  PLANNED_AT,
  plannedNote,
  PRO_BILLING,
  VAT_SHARES,
} from "./delivery-note-sheet.fixture.js";

/** Un BL d'avant E4a : son en-tête est vide (CHECK « tout ou rien »). */
function withoutTerms() {
  return DeliveryNote.rehydrate({ ...plannedNote().toState(), terms: null }).toState();
}

/**
 * Le test de compilation du plan E5a, § 4 : le type du BL de transport n'a
 * AUCUNE clé qui ressemble à un montant — ni sur lui, ni sur ses lignes.
 */
type MoneyLike = `${string}Cents` | `${string}Millicents` | "money" | "vatRate";
type CarrierMoneyKeys = Extract<keyof CarrierNote | keyof CarrierNote["lines"][number], MoneyLike>;
const CARRIER_HAS_NO_MONEY: [CarrierMoneyKeys] extends [never] ? true : false = true;

describe("carrierNoteOf — le BL de transport", () => {
  it("n'a aucun champ monétaire dans son type", () => {
    expect(CARRIER_HAS_NO_MONEY).toBe(true);
  });

  it("porte le numéro, la commande, le client, l'adresse et les quantités — et aucun montant", () => {
    const note = carrierNoteOf(handedOverNote(), HEAD);

    expect(note).toMatchObject({
      audience: "carrier",
      number: "BL-1042-1",
      orderReference: "ORD-1042",
      receivedOn: "1970-01-02",
      customer: HEAD.customer,
      fulfillment: HEAD.fulfillment,
      issuedAt: HANDED_OVER_AT.toISOString(),
    });
    expect(note.lines).toEqual([
      { sku: "PAIN-001", productName: "Pain de campagne", quantity: 12 },
      { sku: "VIEN-002", productName: "Croissant", quantity: 6 },
    ]);
    expect(JSON.stringify(note)).not.toMatch(/Cents|Millicents|money/u);
  });

  it("s'imprime même sur un BL d'avant E4a, qui n'a pas de totaux", () => {
    expect(carrierNoteOf(withoutTerms(), HEAD).lines).toHaveLength(2);
  });
});

describe("clientNoteOf — le BL chiffré", () => {
  it("lit ses montants sur le BL, et la TVA par taux recopiée", () => {
    const state = plannedNote().toState();
    const note = clientNoteOf(state, HEAD, PRO_BILLING);

    expect(note.money).toMatchObject({
      subtotalCents: state.terms?.subtotalCents,
      totalCents: state.terms?.totalCents,
      vatShares: VAT_SHARES,
      currency: "EUR",
      settlement: "account",
    });
    expect(note.issuedAt).toBe(PLANNED_AT.toISOString());
  });

  it("marque la ligne hors remise de retrait, et elle seule", () => {
    const note = clientNoteOf(plannedNote().toState(), HEAD, PRO_BILLING);

    expect(note.lines[0]).not.toHaveProperty("pickupDiscountEligible");
    expect(note.lines[1]?.pickupDiscountEligible).toBe(false);
  });

  it("n'imprime pas le téléphone de l'acheteur sur un BL pro", () => {
    expect(clientNoteOf(plannedNote().toState(), HEAD, PRO_BILLING).customerPhone).toBeNull();
  });

  it("le garde sur un BL public", () => {
    const note = clientNoteOf(plannedNote().toState(), HEAD, { ...PRO_BILLING, variant: "public" });

    expect(note.customerPhone).toBe("06 11 11 11 11");
  });

  it("rend « dont TVA » au total plutôt qu'un détail deviné, quand la forme recopiée est inconnue", () => {
    const state = plannedNote().toState();
    const odd = { ...state, terms: state.terms && { ...state.terms, vatShares: [{ x: 1 }] } };

    expect(clientNoteOf(odd, HEAD, PRO_BILLING).money.vatShares).toBeNull();
  });

  it("refuse un BL sans totaux plutôt que d'inventer ses montants", () => {
    expect(() => clientNoteOf(withoutTerms(), HEAD, PRO_BILLING)).toThrow(
      DeliveryNoteWithoutTermsError,
    );
  });
});

describe("staffNoteOf — le BL de l'équipe", () => {
  it("ajoute l'état et ses dates", () => {
    const note = staffNoteOf(handedOverNote(), HEAD, PRO_BILLING);

    expect(note).toMatchObject({
      audience: "staff",
      status: "handed_over",
      plannedAt: PLANNED_AT.toISOString(),
      handedOverAt: HANDED_OVER_AT.toISOString(),
      voidedAt: null,
    });
    expect(note.lines[0]?.sku).toBe("PAIN-001");
  });

  it("montre un BL sans totaux, montants à null, au lieu de faire tomber la liste", () => {
    expect(staffNoteOf(withoutTerms(), HEAD, PRO_BILLING).money).toBeNull();
  });
});
