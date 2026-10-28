import {
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "../../channels/commerce/index.js";
import type { DepartureSheet } from "../../domain/entities/departure-sheet.js";
import { deliveryOn, FixedDeliveryOrders } from "../commands/__tests__/round-doubles.js";
import { FixedDepartures } from "../queries/__tests__/packing-doubles.js";
import { DayRoundsDossierChecks } from "../day-rounds-dossier-checks.js";
import { ShipmentNoteNumbers } from "../shipment-note-numbers.js";

/** Le jour n'est que recopié : rien ici ne lit l'horloge. */
const DAY = "2026-10-07";

/** Le commerce, avec adresse et contact sur chaque feuille sauf celles nommées. */
class SheetedOrders extends FixedDeliveryOrders {
  constructor(
    orders: ConstructorParameters<typeof FixedDeliveryOrders>[0],
    private readonly bare: ReadonlySet<string>,
  ) {
    super(orders);
  }
  override async departureSheetsOf(
    orderIds: readonly string[],
  ): Promise<readonly DepartureSheet[]> {
    return (await super.departureSheetsOf(orderIds)).map((sheet) =>
      this.bare.has(sheet.orderId)
        ? sheet
        : {
            ...sheet,
            address: {
              label: "",
              ligne1: "1 rue du Col",
              ligne2: "",
              codePostal: "73000",
              ville: "Chambéry",
              pays: "FR",
            },
            contact: { prenom: "Léa", nom: "Martin", telephone: "0600000000" },
          },
    );
  }
}

/** Le carnet : ces commandes-là y sont reliées, sous le mur. */
class LinkedAddresses extends DeliveryAddressPointsReader {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly linked: ReadonlySet<string>) {
    super();
  }
  addressesOfOrders(orderIds: readonly string[]): Promise<readonly DeliveryOrderAddress[]> {
    this.asked.push(orderIds);
    return Promise.resolve(
      orderIds
        .filter((id) => this.linked.has(id))
        .map((orderId) => ({
          orderId,
          addressId: `a_${orderId}`,
          companyId: "c1",
          customerLabel: "",
          addressLabel: "",
          address: { label: "", ligne1: "", ligne2: "", codePostal: "", ville: "", pays: "FR" },
          door: null,
          parking: null,
        })),
    );
  }
}

function subject() {
  const orders = new SheetedOrders(
    [
      deliveryOn("o_ok", DAY),
      deliveryOn("o_loose", DAY),
      deliveryOn("o_bare", DAY),
      deliveryOn("o_short", DAY),
      deliveryOn("o_gone", DAY, { status: "cancelled" }),
    ],
    new Set(["o_bare", "o_gone"]),
  );
  const addresses = new LinkedAddresses(new Set(["o_ok", "o_bare", "o_short", "o_gone"]));
  const departures = new FixedDepartures(
    new Map([
      [
        "o_short",
        {
          lines: [],
          shortfall: {
            remainder: "abandoned" as const,
            lines: [
              { sku: "SKU-1", productName: "Baguette", quantity: 2, saleUnit: "piece" as const },
            ],
          },
        },
      ],
    ]),
  );
  return { checks: new DayRoundsDossierChecks(orders, addresses, departures), addresses };
}

describe("DayRoundsDossierChecks — les alertes lues aux canaux de la livraison", () => {
  it("croise commande, feuille, carnet et départ, et ne garde que ce qui est à vérifier", async () => {
    const { checks } = subject();
    const result = await checks.checksOf(
      [
        { orderId: "o_ok", rank: 1, roundTitle: "Camion 1 · passage 1" },
        { orderId: "o_loose", rank: 1, roundTitle: "Camion 1 · passage 1" },
        { orderId: "o_bare", rank: 1, roundTitle: null },
        { orderId: "o_short", rank: 1, roundTitle: "Camion 2 · passage 1" },
        { orderId: "o_gone", rank: 1, roundTitle: "Camion 2 · passage 1" },
        { orderId: "o_ghost", rank: 1, roundTitle: "Camion 2 · passage 1" },
      ],
      ShipmentNoteNumbers.NONE,
    );
    expect(result.map((check) => [check.reference, check.roundTitle, check.reasons])).toEqual([
      [
        "o_ghost",
        "Camion 2 · passage 1",
        ["Commande inconnue du commerce : aucune feuille à imprimer"],
      ],
      ["ORD-o_bare", null, ["Aucune adresse sur la commande", "Aucun contact sur la commande"]],
      [
        "ORD-o_loose",
        "Camion 1 · passage 1",
        ["Adresse non reliée au carnet : ni point GPS, ni consignes, ni procédure"],
      ],
      ["ORD-o_short", "Camion 2 · passage 1", ["Départ incomplet, ne part pas : 2 × Baguette"]],
    ]);
  });

  it("porte le BL de l'envoi à son rang, rien sans BL (2026-10-26)", async () => {
    const { checks } = subject();
    const numbers = ShipmentNoteNumbers.of([
      { orderId: "o_loose", rank: 1, number: "BL-loose-1" },
      { orderId: "o_short", rank: 1, number: "BL-short-1" },
      { orderId: "o_short", rank: 2, number: "BL-short-2" },
    ]);
    const result = await checks.checksOf(
      [
        { orderId: "o_loose", rank: 1, roundTitle: null },
        { orderId: "o_short", rank: 2, roundTitle: null },
        { orderId: "o_bare", rank: 1, roundTitle: null },
      ],
      numbers,
    );
    expect(result.map((check) => [check.reference, check.deliveryNoteNumber])).toEqual([
      ["ORD-o_bare", null],
      ["ORD-o_loose", "BL-loose-1"],
      ["ORD-o_short", "BL-short-2"],
    ]);
  });

  it("ne lit rien quand il n'y a aucune commande", async () => {
    const { checks, addresses } = subject();
    expect(await checks.checksOf([], ShipmentNoteNumbers.NONE)).toEqual([]);
    expect(addresses.asked).toEqual([]);
  });

  it("lit le carnet une fois pour le lot, sans doublon", async () => {
    const { checks, addresses } = subject();
    await checks.checksOf(
      [
        { orderId: "o_ok", rank: 1, roundTitle: null },
        { orderId: "o_ok", rank: 1, roundTitle: null },
        { orderId: "o_loose", rank: 1, roundTitle: null },
      ],
      ShipmentNoteNumbers.NONE,
    );
    expect(addresses.asked).toEqual([["o_ok", "o_loose"]]);
  });
});
