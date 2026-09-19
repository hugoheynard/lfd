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
 */
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
    const member = new BillingAddressSavedByMemberEvent("c1", BILLING).journalFact();
    const staff = new BillingAddressSavedByStaffEvent("c1", BILLING).journalFact();

    expect(member.payload).toEqual({ ville: "Paris", codePostal: "75011" });
    expect(member.payload).toEqual(staff.payload);
    expect(member.type).toBe(staff.type);
  });

  it("livraison ajoutée puis corrigée : l'identifiant en plus, la même forme des deux côtés", () => {
    const pairs = [
      [
        new DeliveryAddressAddedByMemberEvent("c1", "a1", DELIVERY).journalFact(),
        new DeliveryAddressAddedByStaffEvent("c1", "a1", DELIVERY).journalFact(),
      ],
      [
        new DeliveryAddressUpdatedByMemberEvent("c1", "a1", DELIVERY).journalFact(),
        new DeliveryAddressUpdatedByStaffEvent("c1", "a1", DELIVERY).journalFact(),
      ],
    ] as const;

    for (const [member, staff] of pairs) {
      expect(member.payload).toEqual({ addressId: "a1", ville: "Paris", codePostal: "75011" });
      expect(member.payload).toEqual(staff.payload);
      expect(member.type).toBe(staff.type);
    }
  });

  it("ni la rue, ni son numéro, ni le complément, ni le libellé", () => {
    const written = JSON.stringify([
      new BillingAddressSavedByMemberEvent("c1", BILLING).journalFact(),
      new DeliveryAddressAddedByMemberEvent("c1", "a1", DELIVERY).journalFact(),
      new DeliveryAddressUpdatedByMemberEvent("c1", "a1", DELIVERY).journalFact(),
    ]);

    for (const absent of [STREET, "12", "Bâtiment B", "Siège", "Boutique"]) {
      expect(written).not.toContain(absent);
    }
  });
});
