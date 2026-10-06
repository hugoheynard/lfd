import type { DeliveryAddressPayload } from "@lfd/contracts";

import { CompanyAddressNotFoundError } from "../../errors/account-errors.js";
import { InvalidAddressPointError } from "../../errors/address-point-errors.js";
import { DeliveryAddressBook } from "../delivery-address-book.js";

/**
 * **La porte et le stationnement d'une adresse** (`gps-y-aller-et-position.md`,
 * §6) : `correctPoint` est le seul chemin du stationnement, et la charge
 * d'édition ne l'efface pas.
 *
 * Les dates sont absolues légitimement : le carnet ne les compare qu'entre
 * elles, jamais à l'horloge (`CLAUDE.md` §5).
 */

const CREATED = new Date("2026-01-01T08:00:00Z");
const DOOR = { lat: 45.5651, lng: 5.9182 };
const PARKING = { lat: 45.5655, lng: 5.919 };

function payload(): DeliveryAddressPayload {
  return {
    label: "Hôtel du Parc",
    ligne1: "2 avenue du Parc",
    ligne2: "",
    codePostal: "73000",
    ville: "Chambéry",
    pays: "France",
    isDefault: false,
    specs: {
      note: "Livraisons par la cour",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  };
}

function book(): DeliveryAddressBook {
  const created = DeliveryAddressBook.reconstitute({
    companyId: "c1",
    entries: [],
    defaultId: null,
  });
  created.add("a1", payload(), CREATED);
  return created;
}

describe("DeliveryAddressBook.correctPoint — la porte et le stationnement (§6)", () => {
  it("une adresse ajoutée n'a aucun stationnement", () => {
    expect(book().deliveries()[0]?.parking).toBeNull();
  });

  it("la porte devient le point GPS des consignes, le reste des consignes intact", () => {
    const carnet = book();

    expect(carnet.correctPoint("a1", "door", DOOR)).toBe(true);

    const entry = carnet.deliveries()[0];
    expect(entry?.specs.gps).toEqual(DOOR);
    expect(entry?.specs.note).toBe("Livraisons par la cour");
    expect(entry?.parking).toBeNull();
  });

  it("le stationnement s'écrit à part, sans toucher la porte", () => {
    const carnet = book();

    expect(carnet.correctPoint("a1", "parking", PARKING)).toBe(true);

    expect(carnet.deliveries()[0]?.parking).toEqual(PARKING);
    expect(carnet.deliveries()[0]?.specs.gps).toBeNull();
  });

  it("le même point ne change rien : rien à journaliser", () => {
    const carnet = book();
    carnet.correctPoint("a1", "parking", PARKING);

    expect(carnet.correctPoint("a1", "parking", { ...PARKING })).toBe(false);
  });

  it("une modification de l'adresse ne l'efface pas — la charge ne le connaît pas", () => {
    const carnet = book();
    carnet.correctPoint("a1", "parking", PARKING);

    carnet.edit("a1", payload());

    expect(carnet.deliveries()[0]?.parking).toEqual(PARKING);
  });

  it("refuse un point hors des bornes, et une adresse absente du carnet", () => {
    const carnet = book();

    expect(() => carnet.correctPoint("a1", "door", { lat: 0, lng: 181 })).toThrow(
      InvalidAddressPointError,
    );
    expect(() => carnet.correctPoint("a1", "door", { lat: Number.NaN, lng: 0 })).toThrow(
      InvalidAddressPointError,
    );
    expect(() => carnet.correctPoint("absente", "door", DOOR)).toThrow(CompanyAddressNotFoundError);
  });

  it("refuse une adresse archivée : elle n'est plus au carnet", () => {
    const carnet = book();
    carnet.archive("a1", CREATED);

    expect(() => carnet.correctPoint("a1", "parking", PARKING)).toThrow(
      CompanyAddressNotFoundError,
    );
  });
});
