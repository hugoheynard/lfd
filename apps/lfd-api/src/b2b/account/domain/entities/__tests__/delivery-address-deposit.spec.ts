import type { DeliveryAddressPayload } from "@lfd/contracts";

import { CompanyAddressNotFoundError } from "../../errors/account-errors.js";
import { DeliveryAddressBook } from "../delivery-address-book.js";

/**
 * **« Dépôt autorisé »** sur le carnet (`plan-a-la-porte.md`, AP-D5).
 *
 * Les dates sont absolues légitimement : le carnet ne les compare qu'entre
 * elles, jamais à l'horloge (`CLAUDE.md` §5).
 */

const CREATED = new Date("2026-01-01T08:00:00Z");

function payload(): DeliveryAddressPayload {
  return {
    label: "Boutique",
    ligne1: "18 rue des Archives",
    ligne2: "",
    codePostal: "75004",
    ville: "Paris",
    pays: "France",
    isDefault: false,
    specs: {
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  };
}

function bookWith(depositAllowed: boolean): DeliveryAddressBook {
  return DeliveryAddressBook.reconstitute({
    companyId: "c1",
    entries: [
      {
        id: "a1",
        lines: {
          label: "Boutique",
          ligne1: "18 rue des Archives",
          ligne2: "",
          codePostal: "75004",
          ville: "Paris",
          pays: "France",
        },
        specs: payload().specs,
        depositAllowed,
        doorstepRule: null,
        createdAt: CREATED,
        archivedAt: null,
      },
    ],
    defaultId: "a1",
  });
}

describe("« dépôt autorisé » sur une adresse du carnet (AP-D5)", () => {
  it("une adresse ajoutée n'autorise rien : personne ne l'a encore dit", () => {
    const book = DeliveryAddressBook.reconstitute({
      companyId: "c1",
      entries: [],
      defaultId: null,
    });

    book.add("a2", payload(), CREATED);

    expect(book.deliveries()[0]?.depositAllowed).toBe(false);
  });

  it("s'autorise, se retire, et dit quand rien ne change", () => {
    const book = bookWith(false);

    expect(book.allowDeposit("a1", true)).toBe(true);
    expect(book.deliveries()[0]?.depositAllowed).toBe(true);
    expect(book.allowDeposit("a1", true)).toBe(false);
    expect(book.allowDeposit("a1", false)).toBe(true);
    expect(book.toPersistence().entries[0]?.depositAllowed).toBe(false);
  });

  it("🔴 modifier l'adresse ne le remet jamais à `false`", () => {
    const book = bookWith(true);

    book.edit("a1", payload());

    expect(book.deliveries()[0]?.depositAllowed).toBe(true);
  });

  it("refuse une adresse qui n'est pas à ce carnet", () => {
    expect(() => bookWith(false).allowDeposit("ailleurs", true)).toThrow(
      CompanyAddressNotFoundError,
    );
  });
});

describe("la décision réglée d'avance à la porte, redéfinie par adresse (B3 bis)", () => {
  it("une adresse ajoutée hérite du réglage global", () => {
    const book = DeliveryAddressBook.reconstitute({
      companyId: "c1",
      entries: [],
      defaultId: null,
    });

    book.add("a2", payload(), CREATED);

    expect(book.deliveries()[0]?.doorstepRule).toBeNull();
  });

  it("se redéfinit, se rend au réglage global, et dit quand rien ne change", () => {
    const book = bookWith(false);

    expect(book.setDoorstepRule("a1", "bring_back")).toBe(true);
    expect(book.setDoorstepRule("a1", "bring_back")).toBe(false);
    expect(book.toPersistence().entries[0]?.doorstepRule).toBe("bring_back");
    expect(book.setDoorstepRule("a1", null)).toBe(true);
    expect(book.deliveries()[0]?.doorstepRule).toBeNull();
  });

  it("🔴 modifier l'adresse ne la touche pas — ni le dépôt autorisé", () => {
    const book = bookWith(true);
    book.setDoorstepRule("a1", "deposit");

    book.edit("a1", payload());

    expect(book.deliveries()[0]).toMatchObject({ doorstepRule: "deposit", depositAllowed: true });
  });

  it("refuse une adresse qui n'est pas à ce carnet", () => {
    expect(() => bookWith(false).setDoorstepRule("ailleurs", "ask")).toThrow(
      CompanyAddressNotFoundError,
    );
  });
});
