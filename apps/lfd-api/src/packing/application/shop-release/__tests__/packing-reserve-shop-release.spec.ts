import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { PackingStock } from "../../../domain/entities/packing-stock.js";
import { ReserveShortForShopError } from "../../../domain/errors/packing-shop-release-errors.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemoryStocks } from "../../__tests__/station-doubles.js";
import { PackingReserveShopRelease } from "../packing-reserve-shop-release.js";

/**
 * La sortie de réserve vers une boutique (plan A1, lot A1.4). Un jour
 * recopié, jamais comparé à l'horloge.
 */
const DAY = "2030-03-12";

/** La réserve en mémoire, qui retient l'ordre des verrous. */
class LockOrderStocks extends InMemoryStocks {
  readonly locked: string[] = [];

  override lock(serviceDay: string, sku: string): Promise<PackingStock> {
    this.locked.push(sku);
    return super.lock(serviceDay, sku);
  }
}

function setup() {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 10, returned: 0 });
  shadow.stocks.set(`${DAY}/BAG`, { received: 4, returned: 0 });
  const stocks = new LockOrderStocks(shadow);
  const events = new RecordingPublisher();
  return { stocks, events, release: new PackingReserveShopRelease(stocks, events) };
}

const RELEASE = {
  serviceDay: DAY,
  siteId: "site_1",
  siteLabel: "Village",
  resupplyId: "rsp_1",
  lines: [
    { sku: "CRO", productName: "Croissant", quantity: 6 },
    { sku: "BAG", productName: "Baguette", quantity: 4 },
  ],
};

describe("PackingReserveShopRelease — envoyer en boutique depuis la réserve", () => {
  it("sort chaque article de la réserve, verrouillés par SKU triés", async () => {
    const { stocks, release } = setup();

    await release.send(RELEASE);

    expect(stocks.locked).toEqual(["BAG", "CRO"]);
    expect(stocks.sentOf(DAY, "CRO")).toBe(6);
    expect(stocks.sentOf(DAY, "BAG")).toBe(4);
  });

  it("journalise la sortie : la journée, le point nommé, le réassort, les lignes", async () => {
    const { events, release } = setup();

    await release.send(RELEASE);

    expect(events.factTypes()).toEqual(["packing_stock.sent_to_shop"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "packing_stock",
      subjectId: DAY,
      payload: {
        serviceDay: DAY,
        site: { id: "site_1", name: "Village" },
        resupplyId: "rsp_1",
        lines: [
          { sku: "BAG", productName: "Baguette", quantity: 4 },
          { sku: "CRO", productName: "Croissant", quantity: 6 },
        ],
      },
    });
  });

  it("un point que l'annuaire ne nomme pas se cite par son id", async () => {
    const { events, release } = setup();

    await release.send({ ...RELEASE, siteLabel: null });

    expect(events.traced[0]?.journalFact().payload["site"]).toBe("site_1");
  });

  it("refuse quand le libre manque, et ne journalise rien", async () => {
    const { events, release } = setup();

    await expect(
      release.send({
        ...RELEASE,
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 11 }],
      }),
    ).rejects.toThrow(ReserveShortForShopError);
    expect(events.factTypes()).toEqual([]);
  });
});
