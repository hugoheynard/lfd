import type { DossierStaffCard } from "../../entities/dossier-recipient.js";
import type { StoredDossierRecipient } from "../../ports/dossier-recipients.reader.js";
import { dossierAddresseesOf, dossierCountsOf, methodSplitOf } from "../dossier-addressees.js";

/** **À qui part le dossier** (plan `dossier-prod-du-jour.md`, E3). */

function card(overrides: Partial<DossierStaffCard> = {}): DossierStaffCard {
  return {
    staffUserId: "s-paul",
    firstName: "Paul",
    lastName: "Martin",
    email: "paul@fournil.fr",
    jobTitle: "Chef",
    active: true,
    ...overrides,
  };
}

const external: StoredDossierRecipient = {
  id: "r-ext",
  kind: "external",
  email: "jeanne@imprimerie.fr",
  firstName: "Jeanne",
  lastName: "Roux",
  jobTitle: null,
};
const staff: StoredDossierRecipient = { id: "r-paul", kind: "staff", staffUserId: "s-paul" };

describe("dossierAddresseesOf", () => {
  it("sert un externe tel qu'inscrit, et une fiche avec son nom et son adresse d'aujourd'hui", () => {
    const cards = new Map([["s-paul", card({ email: "paul.neuf@fournil.fr" })]]);
    expect(dossierAddresseesOf([staff, external], cards)).toEqual([
      {
        recipientId: "r-paul",
        email: "paul.neuf@fournil.fr",
        firstName: "Paul",
        name: "Paul Martin",
      },
      {
        recipientId: "r-ext",
        email: "jeanne@imprimerie.fr",
        firstName: "Jeanne",
        name: "Jeanne Roux",
      },
    ]);
  });

  it.each([
    ["disparue de l'annuaire", new Map<string, DossierStaffCard>()],
    ["suspendue", new Map([["s-paul", card({ active: false })]])],
    ["sans adresse", new Map([["s-paul", card({ email: " " })]])],
  ])("écarte une fiche %s", (_case, cards) => {
    expect(dossierAddresseesOf([staff], cards)).toEqual([]);
  });

  it("ne sert une même adresse qu'une fois, la première ligne inscrite gardant l'envoi", () => {
    const cards = new Map([["s-paul", card({ email: "JEANNE@imprimerie.fr" })]]);
    expect(dossierAddresseesOf([external, staff], cards).map((one) => one.recipientId)).toEqual([
      "r-ext",
    ]);
  });
});

describe("dossierCountsOf", () => {
  it("compte les commandes, par mode, et toutes leurs pièces", () => {
    const line = (quantity: number) => ({ sku: "VIE-001", productName: "Croissant", quantity });
    const order = (
      orderId: string,
      quantities: readonly number[],
      fulfillmentMethod: "pickup" | "delivery" = "pickup",
    ) => ({
      orderId,
      reference: orderId,
      customerLabel: "",
      fulfillmentMethod,
      destination: "",
      dueAt: null,
      clientele: null,
      sheetDetails: null,
      lines: quantities.map(line),
      packed: null,
    });
    expect(dossierCountsOf([order("a", [12, 3]), order("b", [5], "delivery")])).toEqual({
      orders: 2,
      pickup: 1,
      delivery: 1,
      pieces: 20,
    });
    expect(dossierCountsOf([])).toEqual({ orders: 0, pickup: 0, delivery: 0, pieces: 0 });
  });
});

describe("methodSplitOf", () => {
  it("dit retrait et livraison, et tait la part à zéro", () => {
    expect(methodSplitOf(2, 1)).toBe("2 en retrait, 1 en livraison");
    expect(methodSplitOf(3, 0)).toBe("3 en retrait");
    expect(methodSplitOf(0, 4)).toBe("4 en livraison");
    expect(methodSplitOf(0, 0)).toBe("");
  });
});

describe("dossierAddresseesOf — un externe sans nom", () => {
  it("le salue tout court et le nomme « un destinataire externe », jamais par son adresse", () => {
    const nameless: StoredDossierRecipient = {
      id: "r-x",
      kind: "external",
      email: "x@x.fr",
      firstName: null,
      lastName: null,
      jobTitle: null,
    };
    expect(dossierAddresseesOf([nameless], new Map())).toEqual([
      { recipientId: "r-x", email: "x@x.fr", firstName: "", name: "un destinataire externe" },
    ]);
  });
});
