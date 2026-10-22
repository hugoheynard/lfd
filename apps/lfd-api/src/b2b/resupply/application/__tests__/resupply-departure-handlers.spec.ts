import { TransferDepartedFact } from "../../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import type { SiteResupplySnapshot } from "../../domain/site-resupply.js";
import { RecordDepartureOnTransferDeparted } from "../record-departure-on-transfer-departed.handler.js";
import { Directory } from "./resupply-doubles.js";
import { InMemorySiteResupplies } from "./site-resupply-doubles.js";

/**
 * « Réassort parti » (R4d) : la tournée qui porte le transfert part, le
 * commerce l'affiche — au nom du livreur, à l'instant du départ, une seule
 * fois. Des instants comparés entre eux seulement, jamais à l'horloge.
 */
const PLACED_AT = new Date(1_000);
const DEPARTED_AT = new Date(5_000);
const LATER = new Date(9_000);
const VILLAGE = "site_village";
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };

function placed(id: string, overrides: Partial<SiteResupplySnapshot> = {}): SiteResupplySnapshot {
  return {
    id,
    siteId: VILLAGE,
    target: "asap",
    serviceDay: "2030-03-12",
    version: 2,
    origin: "counter",
    name: null,
    lines: [{ sku: "CRO", label: "Croissant", quantity: 12 }],
    placed: { at: PLACED_AT, author: LOU },
    cancelled: null,
    arrived: null,
    launched: { at: PLACED_AT, byName: "Paul" },
    ...overrides,
  };
}

function deliveryOf(
  resupplyIds: readonly string[],
  at: Date = DEPARTED_AT,
  driver: string | null = "staff_lea",
): DurableDelivery {
  const fact = new TransferDepartedFact("t_1", VILLAGE, "2030-03-12", at, driver, resupplyIds);
  const { type, payload } = fact.durableFact();
  return { eventId: "evt_1", type, payload };
}

function world(driverName: string | null = "Léa") {
  const resupplies = new InMemorySiteResupplies();
  const directory = new Directory(
    driverName === null ? null : { name: driverName, role: "driver" },
  );
  return { resupplies, handler: new RecordDepartureOnTransferDeparted(resupplies, directory) };
}

describe("« réassort parti » au départ du transfert (R4d)", () => {
  it("pose « parti » à l'instant du départ et au nom du livreur", async () => {
    const { resupplies, handler } = world();
    resupplies.put(placed("rs_1"));

    await handler.handle(deliveryOf(["rs_1"]));

    expect(resupplies.all()[0]?.departed).toEqual({ at: DEPARTED_AT, byName: "Léa" });
  });

  it("rejoué, ne réécrit rien : le premier départ fait foi", async () => {
    const { resupplies, handler } = world();
    resupplies.put(placed("rs_1"));

    await handler.handle(deliveryOf(["rs_1"]));
    await handler.handle(deliveryOf(["rs_1"], LATER));

    expect(resupplies.saves).toBe(1);
    expect(resupplies.all()[0]?.departed?.at).toEqual(DEPARTED_AT);
  });

  it("sans livreur, « parti » reste sans nom", async () => {
    const { resupplies, handler } = world();
    resupplies.put(placed("rs_1"));

    await handler.handle(deliveryOf(["rs_1"], DEPARTED_AT, null));

    expect(resupplies.all()[0]?.departed).toEqual({ at: DEPARTED_AT, byName: null });
  });

  it("vaut aussi pour un réassort du soir porté par le transfert", async () => {
    const { resupplies, handler } = world();
    resupplies.put(placed("rs_soir", { target: "tomorrow", launched: null }));

    await handler.handle(deliveryOf(["rs_soir"]));

    expect(resupplies.all()[0]?.departed?.at).toEqual(DEPARTED_AT);
  });

  it("écarte sans lever un réassort introuvable sous le point, ou annulé", async () => {
    const { resupplies, handler } = world();
    resupplies.put(placed("rs_off", { cancelled: { at: PLACED_AT, author: LOU } }));

    await handler.handle(deliveryOf(["rs_inconnu", "rs_off"]));

    expect(resupplies.saves).toBe(0);
    expect(resupplies.all()[0]?.departed ?? null).toBeNull();
  });
});
