import { localToInstant } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PlannedDestinationsReader,
  QualityHeldOrdersReader,
} from "../../../../production/channels/packing/index.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  PackingBoardReader,
  type BoardOrder,
  type PackingBoardDay,
} from "../../../domain/ports/packing-board.reader.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { type OrderDeparture, OrderDeparturesReader } from "../../../channels/delivery/index.js";
import { GetPackingBoardHandler } from "../get-packing-board.handler.js";
import { GetPackingBoardQuery } from "../get-packing-board.query.js";

// Un jour et des instants comparés entre eux, jamais au mur.
const DAY = "2030-03-12";
const AT = new Date(1_000);

class FixedBoard extends PackingBoardReader {
  constructor(private readonly day: PackingBoardDay) {
    super();
  }

  dayOf(): Promise<PackingBoardDay> {
    return Promise.resolve(this.day);
  }
}

/** La retenue publiée par le fournil : notée, puis rendue. */
class FixedHeld extends QualityHeldOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly held: ReadonlySet<string>) {
    super();
  }

  heldOrders(_serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push(orderIds);
    return Promise.resolve(new Set(orderIds.filter((id) => this.held.has(id))));
  }
}

class FixedDestinations extends PlannedDestinationsReader {
  readonly asked: string[] = [];

  constructor(private readonly destinations: ReadonlyMap<string, string>) {
    super();
  }

  destinationsOf(serviceDay: string): Promise<ReadonlyMap<string, string>> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.destinations);
  }
}

/** Les départs que la livraison connaît : notés, puis rendus. */
class FixedDepartures extends OrderDeparturesReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly departures: readonly OrderDeparture[]) {
    super();
  }

  departuresOf(orderIds: readonly string[]): Promise<readonly OrderDeparture[]> {
    this.asked.push(orderIds);
    return Promise.resolve(this.departures.filter((one) => orderIds.includes(one.orderId)));
  }
}

function parisAt(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`Heure inexistante à Paris : ${day} ${time}`);
  }
  return instant;
}

function order(orderId: string, packedBy: string | null): BoardOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: AT,
    packed: packedBy === null ? null : { at: AT, by: packedBy },
    containers: 0,
    containerMode: "listed",
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 1, packed: null }],
    containerList: [],
  };
}

function setup(day: PackingBoardDay, known: readonly OrderDeparture[] = []) {
  const departures = new FixedDepartures(known);
  const held = new FixedHeld(new Set(["2"]));
  const destinations = new FixedDestinations(new Map([["1", "12 rue du Four"]]));
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Boulanger" }, "staff_1"),
  );
  const handler = new GetPackingBoardHandler(
    new FixedBoard(day),
    held,
    destinations,
    authors,
    new FixedClock(AT),
    new ScriptedBinDesk(),
    departures,
  );
  return { handler, held, destinations, authors, departures };
}

describe("GetPackingBoardHandler — le poste lu au colisage (K3a)", () => {
  it("compose ses tables avec la retenue et la destination du fournil, et les auteurs du staff", async () => {
    const { handler, held, authors } = setup({
      orders: [order("1", "staff_1"), order("2", null)],
      stocks: [],
    });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(held.asked).toEqual([["1", "2"]]);
    expect(authors.asked).toEqual([["staff_1", null]]);
    expect(
      view.sheets.map((sheet) => [sheet.orderId, sheet.destination, sheet.qualityHeld]),
    ).toEqual([
      ["1", "12 rue du Four", false],
      ["2", "", true],
    ]);
    expect(view.sheets[0]?.packedByName).toBe("Marie Boulanger");
  });

  it("une journée vide ne demande pas la destination au fournil", async () => {
    const { handler, destinations } = setup({ orders: [], stocks: [] });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(view.closedAt).toBeNull();
    expect(destinations.asked).toEqual([]);
  });

  it("range par heure « prête pour » : le départ de la tournée, du transfert, puis le créneau", async () => {
    const delivery = {
      ...order("1", null),
      fulfillmentMethod: "delivery" as const,
      dueAt: "11:00",
    };
    const onSite = { ...order("2", null), dueAt: "06:45" };
    const viaTransfer = { ...order("3", null), dueAt: "09:00" };
    const notComposed = {
      ...order("4", null),
      fulfillmentMethod: "delivery" as const,
      dueAt: "05:00",
    };
    const { handler, departures } = setup(
      { orders: [delivery, onSite, viaTransfer, notComposed], stocks: [] },
      [
        { orderId: "1", at: parisAt(DAY, "07:10"), via: "delivery", departed: false },
        { orderId: "3", at: parisAt(DAY, "06:30"), via: "transfer", departed: false },
      ],
    );

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(departures.asked).toEqual([["1", "2", "3", "4"]]);
    expect(view.sheets.map((sheet) => [sheet.orderId, sheet.readyBy, sheet.readyBySource])).toEqual(
      [
        ["3", "06:30", "transfer"],
        ["2", "06:45", "due"],
        // La fenêtre du client (11:00) ne compte pas : c'est la tournée qui part.
        ["1", "07:10", "round"],
        // Pas encore de tournée : pas d'heure, en dernier — jamais sa fenêtre.
        ["4", null, null],
      ],
    );
  });
});
