import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import {
  BillingAddressSavedByMemberEvent,
  DeliveryAddressAddedByMemberEvent,
  DeliveryAddressUpdatedByMemberEvent,
} from "../member-acts.event.js";
import {
  BillingAddressSavedByStaffEvent,
  DeliveryAddressAddedByStaffEvent,
  DeliveryAddressUpdatedByStaffEvent,
} from "../staff-address-acts.event.js";

/**
 * **Un type de fait, une forme de charge** : les gestes d'adresse du client
 * écrivent exactement ce qu'écrit le staff pour le même type (décision de Hugo,
 * 2026-09-19). Jusque-là le client écrivait un libellé, le staff une ville et
 * un code postal — deux lecteurs du même fait devaient connaître deux formes.
 *
 * Depuis le lot B du plan des phrases (même jour), les deux côtés nomment la
 * société (`subjectLabel`) et citent l'adresse par son id et son lieu
 * (`address`) : la même forme toujours, ni rue, ni numéro, ni libellé.
 */
const COMPANY = { id: "c1", name: "Le Pain Quotidien" };
const ADDRESS = { id: "a1", ville: "Paris", codePostal: "75011" };
const STREET = "12 rue Oberkampf";

const BILLING: BillingAddressPayload = {
  label: "Siège",
  ligne1: STREET,
  ligne2: "Bâtiment B",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
};

const DELIVERY: DeliveryAddressPayload = {
  ...BILLING,
  label: "Boutique",
  isDefault: false,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

describe("la charge d'une adresse au journal", () => {
  it("facturation : client et staff écrivent la ville et le code postal, rien d'autre", () => {
    const member = new BillingAddressSavedByMemberEvent(COMPANY, BILLING).journalFact();
    const staff = new BillingAddressSavedByStaffEvent(COMPANY, BILLING).journalFact();

    expect(member.payload).toEqual({
      subjectLabel: "Le Pain Quotidien",
      ville: "Paris",
      codePostal: "75011",
    });
    expect(member.payload).toEqual(staff.payload);
    expect(member.type).toBe(staff.type);
  });

  it("livraison ajoutée puis corrigée : l'adresse citée par son lieu, la même forme des deux côtés", () => {
    const pairs = [
      [
        new DeliveryAddressAddedByMemberEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
        new DeliveryAddressAddedByStaffEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
      ],
      [
        new DeliveryAddressUpdatedByMemberEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
        new DeliveryAddressUpdatedByStaffEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
      ],
    ] as const;

    for (const [member, staff] of pairs) {
      expect(member.payload).toEqual({
        subjectLabel: "Le Pain Quotidien",
        address: { id: "a1", ville: "Paris", codePostal: "75011" },
      });
      expect(JSON.stringify(member.payload)).not.toContain(DELIVERY.label);
      expect(member.payload).toEqual(staff.payload);
      expect(member.type).toBe(staff.type);
    }
  });

  it("ni la rue, ni son numéro, ni le complément, ni le libellé de facturation", () => {
    const written = JSON.stringify([
      new BillingAddressSavedByMemberEvent(COMPANY, BILLING).journalFact(),
      new DeliveryAddressAddedByMemberEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
      new DeliveryAddressUpdatedByMemberEvent(COMPANY, ADDRESS, DELIVERY).journalFact(),
    ]);

    // « Boutique » y est désormais — c'est le NOM de l'adresse de livraison
    // (D5) ; le libellé de facturation, lui, ne nomme aucun objet cité.
    for (const absent of [STREET, "12", "Bâtiment B", "Siège"]) {
      expect(written).not.toContain(absent);
    }
  });
});
