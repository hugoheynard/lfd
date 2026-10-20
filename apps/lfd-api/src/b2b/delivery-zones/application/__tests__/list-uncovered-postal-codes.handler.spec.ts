import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";

import {
  DeliveryPostalCodesReader,
  type DeliveryPostalCode,
} from "../../../account/domain/ports/delivery-postal-codes.reader.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import { ListUncoveredPostalCodesHandler } from "../list-uncovered-postal-codes.handler.js";

/** Zones figées : seule `list` est lue par le handler. */
class StaticZones extends DeliveryZoneRepository {
  constructor(private readonly zones: readonly DeliveryZoneView[]) {
    super();
  }
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve(this.zones);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  create(_payload: DeliveryZonePayload): Promise<string> {
    return Promise.resolve("unused");
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

class StaticPostalCodes extends DeliveryPostalCodesReader {
  constructor(private readonly rows: readonly DeliveryPostalCode[]) {
    super();
  }
  ofServedCompanies(): Promise<readonly DeliveryPostalCode[]> {
    return Promise.resolve(this.rows);
  }
}

const TARENTAISE: DeliveryZoneView = {
  id: "zone_1",
  postalPrefixes: ["731", "73320"],
  label: "Tarentaise",
  fee: { mode: "amount", cents: 1_500 },
};

describe("ListUncoveredPostalCodesHandler", () => {
  it("rend les seuls codes de livraison qu'aucune zone ne couvre", async () => {
    const handler = new ListUncoveredPostalCodesHandler(
      new StaticZones([TARENTAISE]),
      new StaticPostalCodes([
        { postalCode: "73150", city: "Val d'Isère", companyId: "c1", companyName: "Le Refuge" },
        { postalCode: "73320", city: "Tignes", companyId: "c2", companyName: "La Folie" },
        { postalCode: "74400", city: "Chamonix", companyId: "c3", companyName: "Le Brévent" },
      ]),
    );

    await expect(handler.execute()).resolves.toEqual([
      {
        postalCode: "74400",
        cities: ["Chamonix"],
        companyCount: 1,
        companies: [{ id: "c3", name: "Le Brévent" }],
      },
    ]);
  });

  it("rend tout ce qu'il y a quand aucune zone n'existe", async () => {
    const handler = new ListUncoveredPostalCodesHandler(
      new StaticZones([]),
      new StaticPostalCodes([
        { postalCode: "73150", city: "Val d'Isère", companyId: "c1", companyName: "Le Refuge" },
      ]),
    );

    const views = await handler.execute();
    expect(views.map((view) => view.postalCode)).toEqual(["73150"]);
  });
});
