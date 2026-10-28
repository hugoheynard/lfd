import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PackingSettings } from "../../../domain/entities/packing-settings.js";
import { HalfSharingDisabledError } from "../../../domain/errors/packing-settings-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets } from "../../__tests__/station-doubles.js";
import { GetShareableHalvesHandler } from "../get-shareable-halves.handler.js";
import { GetShareableHalvesQuery } from "../get-shareable-halves.query.js";
import { OpenPackingContainerCommand } from "../open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../open-packing-container.handler.js";

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const STAFF = "staff_1";
const SHARE = { nature: "bin", partnerBinId: "b_left", innerBags: 0 } as const;
const BIN = { nature: "bin", binTypeId: "t_m", half: false, innerBags: 0 } as const;

function setup(posed: PackingSettings | null) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 20, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "delivery",
  });
  const desk = new ScriptedBinDesk();
  const settings = new InMemoryPackingSettings(posed).reader();
  return {
    sheets,
    desk,
    open: new OpenPackingContainerHandler(
      sheets,
      desk,
      new FixedIdGenerator("ctn"),
      new FixedClock(new Date(0)),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      settings,
    ),
    halves: new GetShareableHalvesHandler(desk, settings),
  };
}

describe("Partager une moitié — soumis à Réglages › Colisage", () => {
  it("refuse le partage quand personne n'a rien réglé, sans appeler la livraison ni rien écrire", async () => {
    const { open, desk, sheets } = setup(null);

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_1", SHARE, STAFF)),
    ).rejects.toThrow(HalfSharingDisabledError);
    expect(desk.shared).toEqual([]);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([]);
  });

  it("refuse le partage quand le réglage est fermé", async () => {
    const { open } = setup(PackingSettings.of({ halfSharing: false }));

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_1", SHARE, STAFF)),
    ).rejects.toThrow(HalfSharingDisabledError);
  });

  it("laisse déclarer un bac entier, partage fermé", async () => {
    const { open, desk } = setup(null);

    await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF));

    expect(desk.declared).toHaveLength(1);
  });

  it("partage une moitié quand le réglage est ouvert", async () => {
    const { open, desk } = setup(PackingSettings.of({ halfSharing: true }));

    await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", SHARE, STAFF));

    expect(desk.shared).toEqual([{ orderId: "ord_1", partnerBinId: "b_left", innerBags: 0 }]);
  });

  it("refuse la liste des moitiés partageables quand le partage est fermé", async () => {
    const { halves } = setup(null);

    await expect(halves.execute(new GetShareableHalvesQuery("ord_1"))).rejects.toThrow(
      HalfSharingDisabledError,
    );
  });
});
