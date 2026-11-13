import {
  dayContentsOver,
  MemoryDayContents,
  settleStore,
} from "../../../../platform/day-versions/__tests__/day-contents-doubles.js";
import {
  globalSources,
  sources,
  versionRegistryOf,
} from "../../../../platform/day-versions/__tests__/day-versions-doubles.js";
import { HandoverQueueReader, type HandoverQueueEntry } from "../../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../../domain/ports/handover-attestations.reader.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { FixedResupplyTransfers } from "../../__tests__/fixed-resupply-transfers.js";
import { FixedTransferStatus } from "../../__tests__/fixed-transfer-status.js";
import { HandoverQueueReading } from "../../services/handover-queue-reading.service.js";
import { GetHandoverQueueHandler } from "../get-handover-queue.handler.js";
import { GetHandoverQueueQuery, type HandoverQueueScope } from "../get-handover-queue.query.js";
import { isHandoverQueueContent } from "../handover-queue-content.js";
import { FixedRoundPlacements } from "./run-sheet-doubles.js";

/**
 * La file du retrait servie depuis l'objet des journées
 * (`le-cache-du-back-office.md`, § 3.4) : numéros lus avant les données,
 * contenu rangé servi sans relire, une clé par périmètre.
 */

const DAY = "2030-03-12";
// Affichée seulement : rien ne compare cet instant à l'horloge.
const PLACED_AT = new Date(1_000);

function entry(orderId: string, fulfillmentMethod: "pickup" | "delivery"): HandoverQueueEntry {
  return {
    orderId,
    reference: `ORD-${orderId}`,
    customerLabel: "Les Halles",
    tradeName: null,
    clientele: "pro",
    pickupLabel: fulfillmentMethod === "pickup" ? "Le labo" : null,
    siteId: null,
    fulfillmentMethod,
    window: null,
    totalUnits: 3,
    abandoned: [],
    status: "ready",
    settled: true,
    readyAt: null,
    placedAt: PLACED_AT,
  };
}

/** La file du commerce : chaque lecture notée dans le journal partagé. */
class LoggedQueue extends HandoverQueueReader {
  loads = 0;

  constructor(
    public entries: readonly HandoverQueueEntry[],
    private readonly log: string[],
  ) {
    super();
  }

  expectedOn(): Promise<readonly HandoverQueueEntry[]> {
    this.loads += 1;
    this.log.push("data");
    return Promise.resolve(this.entries);
  }
}

class NoAttestations extends HandoverAttestationsReader {
  forOrders(): Promise<ReadonlyMap<string, AttestedHandover>> {
    return Promise.resolve(new Map());
  }
}

function around() {
  const log: string[] = [];
  const days = sources();
  const globals = globalSources();
  for (const source of [days.orders, days.production, days.delivery]) {
    const versionOf = source.versionOf.bind(source);
    source.versionOf = (day: string) => {
      log.push(`version:${source.journal}`);
      return versionOf(day);
    };
  }
  const companies = globals.companies;
  const companiesVersion = companies.versionOf.bind(companies);
  companies.versionOf = () => {
    log.push("version:companies");
    return companiesVersion();
  };
  const queue = new LoggedQueue([entry("ord_ret", "pickup"), entry("ord_liv", "delivery")], log);
  const rounds = new FixedRoundPlacements();
  const cache = new MemoryDayContents();
  const handler = new GetHandoverQueueHandler(
    versionRegistryOf(days, globals),
    dayContentsOver(cache),
    new HandoverQueueReading(
      queue,
      new NoAttestations(),
      new FixedQualityHolds(),
      new FixedTransferStatus(),
      new FixedResupplyTransfers(),
      rounds,
    ),
  );
  const read = (scope: HandoverQueueScope) =>
    handler.execute(new GetHandoverQueueQuery(DAY, scope));
  return { read, log, queue, rounds, cache, days, globals };
}

describe("GetHandoverQueueHandler — l'objet des journées", () => {
  it("lit les numéros `orders`, `production`, `delivery` et `companies` AVANT les données", async () => {
    const { read, log } = around();

    await read("whole_day");

    const data = log.indexOf("data");
    for (const subject of ["orders", "production", "delivery", "companies"]) {
      expect(log.indexOf(`version:${subject}`)).toBeGreaterThanOrEqual(0);
      expect(log.indexOf(`version:${subject}`)).toBeLessThan(data);
    }
  });

  it("range la file sous une étiquette qui porte le sujet global `companies`", async () => {
    const { read, cache } = around();

    await read("whole_day");
    await settleStore();

    expect(cache.stored).toEqual([
      {
        screen: "handover-day",
        day: DAY,
        tag: "companies:100.delivery:3.orders:7.production:42",
      },
    ]);
  });

  it("sert la file rangée sans relire les tables", async () => {
    const { read, queue } = around();
    const first = await read("whole_day");
    await settleStore();

    const second = await read("whole_day");

    expect(queue.loads).toBe(1);
    expect(second).toEqual(first);
  });

  it.each(["orders", "production", "delivery"] as const)(
    "relit quand le numéro `%s` monte",
    async (journal) => {
      const { read, queue, days } = around();
      await read("whole_day");
      await settleStore();

      days[journal].version += 1;
      await read("whole_day");

      expect(queue.loads).toBe(2);
    },
  );

  it("relit quand le numéro global `companies` monte — un nom de société a changé", async () => {
    const { read, queue, globals } = around();
    await read("counter");
    await settleStore();

    globals.companies.version += 1;
    queue.entries = [{ ...entry("ord_ret", "pickup"), customerLabel: "Les Halles Neuves" }];
    const view = await read("counter");

    expect(queue.loads).toBe(2);
    expect(view.entries.map((line) => line.customerLabel)).toEqual(["Les Halles Neuves"]);
  });

  it("🔴 range le comptoir à part : sa file reste sans livraison ni tournée", async () => {
    const { read, cache, rounds } = around();
    await read("whole_day");
    await settleStore();

    const counter = await read("counter");
    await settleStore();

    expect(counter.entries.map((line) => line.orderId)).toEqual(["ord_ret"]);
    expect(counter.entries.every((line) => line.round === null)).toBe(true);
    expect(rounds.calls).toHaveLength(1);
    expect(cache.stored.map((slot) => slot.screen)).toEqual(["handover-day", "handover-counter"]);
  });

  it("sert la base quand l'objet est injoignable", async () => {
    const { read, queue, cache } = around();
    cache.failing = true;

    const view = await read("whole_day");

    expect(view.entries).toHaveLength(2);
    expect(queue.loads).toBe(1);
  });
});

describe("isHandoverQueueContent", () => {
  it("reconnaît une file, avec ou sans transferts de réassort", () => {
    expect(isHandoverQueueContent({ day: DAY, entries: [] })).toBe(true);
    expect(isHandoverQueueContent({ day: DAY, entries: [], resupplyTransfers: [] })).toBe(true);
  });

  it("refuse une forme inattendue — relue en base", () => {
    expect(isHandoverQueueContent(null)).toBe(false);
    expect(isHandoverQueueContent({ day: DAY })).toBe(false);
    expect(isHandoverQueueContent({ day: DAY, entries: [], resupplyTransfers: 3 })).toBe(false);
  });
});
