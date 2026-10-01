import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  type DeliveryIncidentRow,
  DeliveryIncidentsReader,
} from "../../../domain/ports/delivery-incidents.reader.js";
import {
  type UndeliveredStopRow,
  UndeliveredStopsReader,
} from "../../../domain/ports/undelivered-stops.reader.js";
import { GetUndeliveredStopsHandler } from "../get-undelivered-stops.handler.js";

// Des instants qui ne servent qu'à fixer « aujourd'hui à Paris » — le jour lu
// est l'objet du test, comparé à des jours écrits relativement à lui.
const SUMMER_MIDNIGHT_PARIS = new Date(Date.UTC(2030, 6, 14, 22, 30));

class AskedUndelivered extends UndeliveredStopsReader {
  readonly asked: string[] = [];

  constructor(private readonly rows: readonly UndeliveredStopRow[]) {
    super();
  }

  undelivered(day: string): Promise<readonly UndeliveredStopRow[]> {
    this.asked.push(day);
    return Promise.resolve(this.rows);
  }
}

class FixedIncidents extends DeliveryIncidentsReader {
  constructor(private readonly rows: readonly DeliveryIncidentRow[]) {
    super();
  }

  ofDay(): Promise<readonly DeliveryIncidentRow[]> {
    return Promise.resolve([]);
  }

  ofRounds(roundIds: readonly string[]): Promise<readonly DeliveryIncidentRow[]> {
    return Promise.resolve(this.rows.filter((row) => roundIds.includes(row.roundId)));
  }
}

function stop(stopId: string): UndeliveredStopRow {
  return {
    roundId: "r_1",
    vehicleName: "Kangoo",
    passage: 1,
    serviceDay: "2030-07-13",
    stopId,
    orderId: `o_${stopId}`,
    reference: `CMD-${stopId}`,
    customerLabel: "Refuge 1950",
    departedAt: SUMMER_MIDNIGHT_PARIS,
    returnedAt: null,
    arrivedAt: null,
  };
}

function incident(id: string, stopId: string | null): DeliveryIncidentRow {
  return {
    id,
    roundId: "r_1",
    stopId,
    orderReference: null,
    family: stopId === null ? "road" : "doorstep",
    reason: stopId === null ? "road_closed" : "nobody_present",
    note: "",
    hasPhoto: false,
    reportedAt: SUMMER_MIDNIGHT_PARIS,
    reportedBy: "staff_paul",
    reportedByName: "Paul Roux",
  };
}

describe("GetUndeliveredStopsHandler — « Non remis » (AP-D7)", () => {
  it("lit « aujourd'hui » à l'heure de Paris, pas en UTC", async () => {
    const stops = new AskedUndelivered([]);
    const handler = new GetUndeliveredStopsHandler(
      stops,
      new FixedIncidents([]),
      new FixedClock(SUMMER_MIDNIGHT_PARIS),
    );

    const view = await handler.execute();

    // 22 h 30 UTC le 14 juillet = 00 h 30 le 15 à Paris.
    expect(stops.asked).toEqual(["2030-07-15"]);
    expect(view.before).toBe("2030-07-15");
  });

  it("pose sur chaque arrêt ses signalements, et ceux de toute la tournée", async () => {
    const handler = new GetUndeliveredStopsHandler(
      new AskedUndelivered([stop("s_1"), stop("s_2")]),
      new FixedIncidents([incident("i_porte", "s_1"), incident("i_route", null)]),
      new FixedClock(SUMMER_MIDNIGHT_PARIS),
    );

    const view = await handler.execute();

    expect(view.stops.map((s) => [s.stopId, s.incidents.map((i) => i.id)])).toEqual([
      ["s_1", ["i_porte", "i_route"]],
      ["s_2", ["i_route"]],
    ]);
  });
});
