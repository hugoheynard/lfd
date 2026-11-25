import {
  type DeliveryAddressBookSource,
  deliveryAddressBookRowOf,
} from "../delivery-address-book-row.mapper.js";

function source(overrides: Partial<DeliveryAddressBookSource> = {}): DeliveryAddressBookSource {
  return {
    id: "a1",
    companyId: "c1",
    label: "Boutique Bastille",
    ligne1: "1 rue de la Roquette",
    ligne2: "",
    codePostal: "75011",
    ville: "Paris",
    pays: "FR",
    isDefault: true,
    deliverySpecs: null,
    depositAllowed: true,
    doorstepRule: "deposit",
    parkingLat: 48.85,
    parkingLng: 2.37,
    tradeName: "Le Zinc",
    legalName: "Café Bastille SARL",
    hasProcedure: true,
    companySignatureRequired: false,
    ...overrides,
  };
}

describe("deliveryAddressBookRowOf", () => {
  it("lit la porte, la note, le contact et le temps sur place des consignes", () => {
    const row = deliveryAddressBookRowOf(
      source({
        deliverySpecs: {
          note: "Sonner deux fois",
          deliveryContact: { prenom: "Léa", nom: "Martin", telephone: "0600000000" },
          gps: { lat: 48.853, lng: 2.369 },
          stopMinutes: 7,
          slotList: { mode: "everyday", slots: [] },
        },
      }),
    );
    expect(row).toMatchObject({
      addressId: "a1",
      tradeName: "Le Zinc",
      legalName: "Café Bastille SARL",
      addressLabel: "Boutique Bastille",
      door: { lat: 48.853, lng: 2.369 },
      parking: { lat: 48.85, lng: 2.37 },
      note: "Sonner deux fois",
      deliveryContact: { prenom: "Léa", nom: "Martin", telephone: "0600000000" },
      stopMinutes: 7,
      depositAllowed: true,
      doorstepRule: "deposit",
      hasProcedure: true,
    });
  });

  it("des consignes absentes ou illisibles se lisent « sans consignes », sans lever", () => {
    for (const deliverySpecs of [null, { gps: "pas un point" }]) {
      const row = deliveryAddressBookRowOf(source({ deliverySpecs }));
      expect(row).toMatchObject({ door: null, note: "", deliveryContact: null, stopMinutes: null });
    }
  });

  it("un stationnement à moitié posé n'est pas un point", () => {
    expect(deliveryAddressBookRowOf(source({ parkingLng: null })).parking).toBeNull();
  });

  it("une adresse qui redéfinit la signature l'emporte sur le socle de la société", () => {
    const row = deliveryAddressBookRowOf(
      source({
        companySignatureRequired: true,
        deliverySpecs: {
          note: "",
          deliveryContact: null,
          gps: null,
          signatureRequired: false,
          slotList: { mode: "everyday", slots: [] },
        },
      }),
    );
    expect(row).toMatchObject({ signatureRequired: false, signatureSource: "address" });
  });

  it("sans redéfinition, ou des consignes illisibles, l'adresse hérite du socle de la société", () => {
    for (const deliverySpecs of [null, { gps: "pas un point" }]) {
      const row = deliveryAddressBookRowOf(
        source({ companySignatureRequired: true, deliverySpecs }),
      );
      expect(row).toMatchObject({ signatureRequired: true, signatureSource: "company" });
    }
  });
});
