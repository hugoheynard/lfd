import { localToInstant } from "@lfd/contracts";

import type { DayContentsCache } from "../../../../platform/day-versions/day-contents-cache.js";
import {
  dayContentsOver,
  MemoryDayContents,
} from "../../../../platform/day-versions/__tests__/day-contents-doubles.js";
import { DayVersionRegistry } from "../../../../platform/day-versions/day-version-registry.js";
import { sources } from "../../../../platform/day-versions/__tests__/day-versions-doubles.js";
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
  DeliveryNoteReprintsReader,
  ShortfallAftermathReader,
  type ShipmentAftermath,
} from "../../../channels/commerce/index.js";
import { type OrderDeparture, OrderDeparturesReader } from "../../../channels/delivery/index.js";
import {
  type BoardOrder,
  type PackingBoardDay,
  PackingBoardReader,
} from "../../../domain/ports/packing-board.reader.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { GetPackingBoardHandler } from "../get-packing-board.handler.js";
import { PackingBoardReading } from "../packing-board-reading.service.js";

// Des instants comparés entre eux, jamais au mur.
export const AT = new Date(1_000);

/** Les tables du colisage : la journée posée, chaque lecture notée dans le journal partagé. */
export class FixedBoard extends PackingBoardReader {
  loads = 0;

  constructor(
    public day: PackingBoardDay,
    private readonly log: string[] = [],
  ) {
    super();
  }

  dayOf(): Promise<PackingBoardDay> {
    this.loads += 1;
    this.log.push("data");
    return Promise.resolve(this.day);
  }
}

/** La retenue publiée par le fournil : notée, puis rendue. */
export class FixedHeld extends QualityHeldOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly held: ReadonlySet<string>) {
    super();
  }

  heldOrders(_serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push(orderIds);
    return Promise.resolve(new Set(orderIds.filter((id) => this.held.has(id))));
  }
}

export class FixedDestinations extends PlannedDestinationsReader {
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
export class FixedDepartures extends OrderDeparturesReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly departures: readonly OrderDeparture[]) {
    super();
  }

  departuresOf(orderIds: readonly string[]): Promise<readonly OrderDeparture[]> {
    this.asked.push(orderIds);
    return Promise.resolve(this.departures.filter((one) => orderIds.includes(one.orderId)));
  }
}

/** Les BL à réimprimer, lus au commerce (plan E6, § 14) : posés par le test. */
export class FixedReprints extends DeliveryNoteReprintsReader {
  readonly needed = new Set<string>();

  reprintNeededAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(orderIds.filter((id) => this.needed.has(id))));
  }
}

/** Les départs incomplets décidés, lus au commerce : posés par le test. */
export class FixedAftermath extends ShortfallAftermathReader {
  readonly decided: ShipmentAftermath[] = [];
  /** Le commerce injoignable : la lecture échoue. */
  down = false;

  among(orderIds: readonly string[]): Promise<readonly ShipmentAftermath[]> {
    if (this.down) {
      return Promise.reject(new Error("commerce injoignable"));
    }
    return Promise.resolve(this.decided.filter((one) => orderIds.includes(one.orderId)));
  }
}

export function parisAt(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`Heure inexistante à Paris : ${day} ${time}`);
  }
  return instant;
}

export function order(orderId: string, packedBy: string | null): BoardOrder {
  return {
    orderId,
    rank: 1,
    reference: `ORD-${orderId}`,
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: AT,
    packed: packedBy === null ? null : { at: AT, by: packedBy },
    containers: 0,
    containerMode: "listed",
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 1, packed: null, saleUnit: "piece" }],
    containerList: [],
    shortfallReportedAt: null,
  };
}

export { MemoryDayContents };

export interface BoardAround {
  readonly known?: readonly OrderDeparture[];
  readonly cache?: DayContentsCache;
  readonly clock?: FixedClock;
}

/**
 * Le poste autour de ses ports doublés : sans objet par défaut, numéros
 * des journaux notés (`version:<journal>`) dans le même journal que les
 * lectures des tables (`data`).
 */
export function boardAround(day: PackingBoardDay, options: BoardAround = {}) {
  const log: string[] = [];
  const journals = sources();
  for (const source of Object.values(journals)) {
    const versionOf = source.versionOf.bind(source);
    source.versionOf = (serviceDay: string) => {
      log.push(`version:${source.journal}`);
      return versionOf(serviceDay);
    };
  }
  const board = new FixedBoard(day, log);
  const reprints = new FixedReprints();
  const aftermath = new FixedAftermath();
  const departures = new FixedDepartures(options.known ?? []);
  const held = new FixedHeld(new Set(["2"]));
  const destinations = new FixedDestinations(new Map([["1", "12 rue du Four"]]));
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Boulanger" }, "staff_1"),
  );
  const reading = new PackingBoardReading(
    board,
    held,
    destinations,
    authors,
    new ScriptedBinDesk(),
    departures,
    reprints,
    aftermath,
  );
  const contents = dayContentsOver(options.cache);
  const handler = new GetPackingBoardHandler(
    new DayVersionRegistry(Object.values(journals)),
    contents,
    reading,
    options.clock ?? new FixedClock(AT),
  );
  return {
    handler,
    log,
    journals,
    board,
    held,
    destinations,
    authors,
    departures,
    reprints,
    aftermath,
  };
}
