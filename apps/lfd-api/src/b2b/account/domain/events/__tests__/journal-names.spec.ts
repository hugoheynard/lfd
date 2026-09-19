import type { DeliveryAddressPayload } from "@lfd/contracts";

import { DeliveryAddressBook } from "../../entities/delivery-address-book.js";
import { CompanyAddressNotFoundError } from "../../errors/account-errors.js";
import { deliveryAddressOf, personName, personRef } from "../journal-names.js";

/**
 * **Les noms que le journal fige** (lot B du plan des phrases, D5) : un nom
 * honnête, ou pas de nom — jamais une coordonnée pour en tenir lieu.
 */
const LINES = {
  label: "",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
};

const DELIVERY: DeliveryAddressPayload = {
  ...LINES,
  label: "Cuisine centrale",
  isDefault: false,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

describe("une adresse de livraison citée", () => {
  /**
   * Régression (lot B, 2026-09-19) : l'adresse était citée par son libellé,
   * texte libre saisi par le client ; Hugo avait tranché pour la ville et le
   * code postal, comme le staff (`a151ccee`).
   */
  it("se cite par son id, sa ville et son code postal — ni libellé, ni rue", () => {
    const book = DeliveryAddressBook.reconstitute({
      companyId: "c1",
      entries: [],
      defaultId: null,
    });
    book.add("a1", DELIVERY, new Date(0));

    expect(deliveryAddressOf(book, "a1")).toEqual({
      id: "a1",
      ville: "Paris",
      codePostal: "75011",
    });
  });

  it("se lit AVANT l'archivage : après, le carnet ne la porte plus", () => {
    const book = DeliveryAddressBook.reconstitute({
      companyId: "c1",
      entries: [],
      defaultId: null,
    });
    book.add("a1", DELIVERY, new Date(0));
    book.archive("a1", new Date(0));

    expect(() => deliveryAddressOf(book, "a1")).toThrow(CompanyAddressNotFoundError);
  });
});

describe("le nom d'une personne", () => {
  it("est « Prénom Nom », ou l'un des deux s'il est seul", () => {
    expect(personName("Camille", "Rousseau")).toBe("Camille Rousseau");
    expect(personName("", "Rousseau")).toBe("Rousseau");
  });

  it("est absent plutôt que vide : la personne est citée par son seul id", () => {
    expect(personName(" ", "")).toBeNull();
    expect(personRef("u1", null)).toEqual({ id: "u1" });
    expect(personRef("u1", "Camille Rousseau")).toEqual({ id: "u1", name: "Camille Rousseau" });
  });
});
