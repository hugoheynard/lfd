import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingOrderNotDrawnYetError,
} from "../../../domain/errors/packing-station-errors.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import {
  InMemorySheets,
  InMemoryStocks,
  RecordingDurable,
} from "../../__tests__/station-doubles.js";
import { PackingStationService } from "../packing-station.service.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const NOW = new Date("2026-09-13T05:30:00.000Z");
const DAY = "2026-09-13";
const ORDER = { serviceDay: DAY, orderId: "ord_1", reference: "CMD-0001" };
const PACKED = "packing.order_packed";

function setup(received = 12) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12, packed: null }],
    containerMode: "counted",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  const stocks = new InMemoryStocks(shadow);
  const durable = new RecordingDurable();
  const station = new PackingStationService(
    sheets,
    stocks,
    new DirectUnitOfWork(),
    durable,
    new FixedClock(NOW),
  );
  return { sheets, stocks, durable, station };
}

describe("PackingStationService — mettre au bac", () => {
  it("prend la ligne à la réserve et signe la ligne", async () => {
    const { station, stocks, sheets } = setup();

    await station.markLine(ORDER, "CRO", { at: AT, by: "s1", initials: "MB" });

    expect(stocks.packedOf(DAY, "CRO")).toBe(12);
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.packed).toEqual({ at: AT, by: "s1", initials: "MB" });
  });

  it("🔴 refuse ce que la réserve ne couvre pas, et n'écrit rien", async () => {
    const { station, stocks, sheets } = setup(5);

    await expect(
      station.markLine(ORDER, "CRO", { at: AT, by: "s1", initials: "" }),
    ).rejects.toBeInstanceOf(LineNotProducedYetError);
    expect(stocks.packedOf(DAY, "CRO")).toBe(0);
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.packed).toBeNull();
  });

  it("recocher ne reprend pas de pièce : deux lignes de 12 sur 12 reçus, non", async () => {
    const { station, stocks } = setup();
    await station.markLine(ORDER, "CRO", { at: AT, by: "s1", initials: "" });
    await station.markLine(ORDER, "CRO", { at: NOW, by: "s2", initials: "" });

    expect(stocks.packedOf(DAY, "CRO")).toBe(12);
  });

  it("ressortir rend les pièces à la réserve", async () => {
    const { station, stocks } = setup();
    await station.markLine(ORDER, "CRO", { at: AT, by: "s1", initials: "" });

    await station.unmarkLine(ORDER, "CRO");

    expect(stocks.packedOf(DAY, "CRO")).toBe(0);
  });

  it("une commande que la liste n'a pas encore livrée est refusée en le disant", async () => {
    const { station } = setup();

    await expect(
      station.markLine({ ...ORDER, orderId: "ord_9", reference: "CMD-0009" }, "CRO", {
        at: AT,
        by: "s1",
        initials: "",
      }),
    ).rejects.toThrow(PackingOrderNotDrawnYetError);
  });
});

describe("PackingStationService — fermer le bac", () => {
  it("ferme, et publie `packing.order_packed` avec l'instant et l'auteur du geste", async () => {
    const { station, durable } = setup();

    const ack = await station.seal(ORDER, { at: AT, by: "s1" });

    expect(ack).toEqual({ packedAt: AT, packedBy: "s1", alreadyPacked: false });
    expect(durable.of(PACKED)).toEqual([
      {
        type: PACKED,
        key: `${PACKED}:ord_1`,
        payload: {
          orderId: "ord_1",
          reference: "CMD-0001",
          packedAt: AT.toISOString(),
          packedBy: "s1",
        },
      },
    ]);
  });

  it("un rescan republie sous une clé NEUVE, avec la signature d'ORIGINE", async () => {
    const { station, durable } = setup();
    await station.seal(ORDER, { at: AT, by: "s1" });

    const ack = await station.seal(ORDER, { at: NOW, by: "s2" });

    expect(ack).toEqual({ packedAt: AT, packedBy: "s1", alreadyPacked: true });
    expect(durable.of(PACKED).map((fact) => fact.key)).toEqual([
      `${PACKED}:ord_1`,
      `${PACKED}:ord_1:reannounced:${NOW.toISOString()}`,
    ]);
  });

  it("un bac fermé ne bouge plus — ni ligne, ni container", async () => {
    const { station } = setup();
    await station.seal(ORDER, { at: AT, by: "s1" });

    await expect(station.unmarkLine(ORDER, "CRO")).rejects.toBeInstanceOf(PackedOrderSealedError);
    await expect(station.stepContainers(ORDER, "add")).rejects.toBeInstanceOf(
      PackedOrderSealedError,
    );
  });
});

describe("PackingStationService — les containers", () => {
  it("le pas et le total s'écrivent sur le bac", async () => {
    const { station, sheets } = setup();

    await station.stepContainers(ORDER, "add");
    await station.stepContainers(ORDER, "add");
    expect(sheets.of(DAY, "ord_1")?.containers).toBe(2);

    await station.declareContainers(ORDER, 5);
    expect(sheets.of(DAY, "ord_1")?.containers).toBe(5);
  });
});
