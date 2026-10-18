import type { AudienceSkuRevenue, AudienceTally } from "../../ports/audience-order.reader.js";
import {
  buildSegmentation,
  presentCell,
  topFamiliesOf,
  UNKNOWN_FAMILY_NAME,
} from "../audience-board.js";

const tally = (over: Partial<AudienceTally>): AudienceTally => ({
  rawKey: "pro",
  rawLabel: null,
  clients: 5,
  orders: 10,
  revenueHtCents: 10_000,
  revenueTtcCents: 10_550,
  ...over,
});

const FAMILIES = new Map([
  ["PAI-001", { id: "fam-pains", name: "Pains" }],
  ["VIE-001", { id: "fam-vien", name: "Viennoiseries" }],
  ["PAT-001", { id: "fam-patis", name: "Pâtisseries" }],
  ["SAL-001", { id: "fam-sale", name: "Salé" }],
]);

describe("une case présentée", () => {
  const cell = { key: "pro", label: "Professionnels" };

  it("montre ses chiffres et son panier moyen arrondi au centime à cinq clients", () => {
    expect(presentCell(cell, tally({ orders: 3, revenueHtCents: 1_000 }), [])).toEqual({
      status: "shown",
      key: "pro",
      label: "Professionnels",
      clients: 5,
      orders: 3,
      revenueHtCents: 1_000,
      revenueTtcCents: 10_550,
      averageBasketHtCents: 333,
      averageBasketTtcCents: 3_517,
      topFamilies: [],
    });
  });

  it("ne dit rien d'une case à quatre clients — ni chiffre, ni famille", () => {
    const families = [{ familyId: "fam-pains", name: "Pains", revenueHtCents: 500 }];
    expect(presentCell(cell, tally({ clients: 4 }), families)).toEqual({
      status: "too_few_clients",
      key: "pro",
      label: "Professionnels",
    });
  });

  it("masque une case sans aucune commande", () => {
    expect(presentCell(cell, null, [])).toMatchObject({ status: "too_few_clients" });
  });
});

describe("les familles en tête", () => {
  it("rend les trois plus gros CA HT, un article inconnu sous « Famille inconnue »", () => {
    const revenues: AudienceSkuRevenue[] = [
      { rawKey: "x", sku: "PAI-001", revenueHtCents: 300 },
      { rawKey: "x", sku: "VIE-001", revenueHtCents: 100 },
      { rawKey: "x", sku: "PAT-001", revenueHtCents: 50 },
      { rawKey: "x", sku: "RETIRE-9", revenueHtCents: 200 },
      { rawKey: "x", sku: "PAI-001", revenueHtCents: 10 },
    ];
    expect(topFamiliesOf(revenues, FAMILIES)).toEqual([
      { familyId: "fam-pains", name: "Pains", revenueHtCents: 310 },
      { familyId: null, name: UNKNOWN_FAMILY_NAME, revenueHtCents: 200 },
      { familyId: "fam-vien", name: "Viennoiseries", revenueHtCents: 100 },
    ]);
  });
});

describe("une coupe", () => {
  it("garde les cases fixes dans leur ordre, une absente masquée", () => {
    const view = buildSegmentation("fulfillment", [tally({ rawKey: "delivery" })], [], FAMILIES);
    expect(view.cells.map((cell) => [cell.key, cell.status])).toEqual([
      ["pickup", "too_few_clients"],
      ["delivery", "shown"],
    ]);
  });

  it("additionne les codes NAF d'une même famille d'activité, puis applique le seuil", () => {
    const view = buildSegmentation(
      "activity",
      [
        tally({ rawKey: "56.10A", clients: 3, orders: 4, revenueHtCents: 400 }),
        tally({ rawKey: "56.21Z", clients: 2, orders: 2, revenueHtCents: 200 }),
        tally({ rawKey: "55.10Z", clients: 4, orders: 9 }),
      ],
      [
        { rawKey: "56.10A", sku: "PAI-001", revenueHtCents: 300 },
        { rawKey: "56.21Z", sku: "PAI-001", revenueHtCents: 150 },
      ],
      FAMILIES,
    );
    const restaurant = view.cells.find((cell) => cell.key === "restaurant");
    expect(restaurant).toMatchObject({
      status: "shown",
      clients: 5,
      orders: 6,
      revenueHtCents: 600,
      topFamilies: [{ familyId: "fam-pains", name: "Pains", revenueHtCents: 450 }],
    });
    expect(view.cells.find((cell) => cell.key === "hospitality")?.status).toBe("too_few_clients");
  });

  it("range les zones de livraison par libellé, jamais par volume", () => {
    const view = buildSegmentation(
      "delivery_zone",
      [
        tally({ rawKey: "73320", rawLabel: "Tignes", clients: 40 }),
        tally({ rawKey: "73150", rawLabel: "Val-d'Isère", clients: 6 }),
        tally({ rawKey: "", rawLabel: null, clients: 1 }),
      ],
      [],
      FAMILIES,
    );
    expect(view.cells.map((cell) => cell.label)).toEqual([
      "73150 Val-d'Isère",
      "73320 Tignes",
      "Adresse de livraison non figée",
    ]);
  });

  it("nomme la tranche et le palier depuis l'index rendu par la base", () => {
    const moment = buildSegmentation("moment", [tally({ rawKey: "6-1" })], [], FAMILIES);
    expect(moment.cells.find((cell) => cell.status === "shown")?.key).toBe("sat-morning");
    const loyalty = buildSegmentation("loyalty", [tally({ rawKey: "2" })], [], FAMILIES);
    expect(loyalty.cells.map((cell) => [cell.key, cell.status])).toEqual([
      ["once", "too_few_clients"],
      ["regular", "too_few_clients"],
      ["loyal", "shown"],
    ]);
  });
});
