import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { LegacyPromotionEditorClosedError } from "../../../promotions/domain/errors/promotion-errors.js";
import { CreatePickupAddressCommand } from "../create-pickup-address.command.js";
import { CreatePickupAddressHandler } from "../create-pickup-address.handler.js";
import { FIELDS, StoredPoints } from "./pickup-address-doubles.js";

describe("CreatePickupAddressHandler — les remises par clientèle", () => {
  /**
   * L12 : l'éditeur des remises de site est fermé. Le refus de forme (« seulement »
   * vide) reste éprouvé au domaine ; ce geste refuse toute remise avant.
   */
  it("refuse de créer un point avec une remise, en nommant l'écran Promotions", async () => {
    const points = new StoredPoints(null);
    const handler = new CreatePickupAddressHandler(
      points,
      new FixedIdGenerator(),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new CreatePickupAddressCommand({
          ...FIELDS,
          discounts: {
            b2b: {
              adjustment: { mode: "percent", bp: 500 },
              scope: "only",
              categories: [],
              products: [],
            },
            b2c: null,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(LegacyPromotionEditorClosedError);
    expect(points.written).toBeNull();
  });
});

describe("CreatePickupAddressHandler — le point GPS", () => {
  function create(points: StoredPoints, gps?: { lat: number; lng: number }): Promise<string> {
    return new CreatePickupAddressHandler(
      points,
      new FixedIdGenerator(),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(
      new CreatePickupAddressCommand({
        ...FIELDS,
        discounts: { b2b: null, b2c: null },
        ...(gps === undefined ? {} : { gps }),
      }),
    );
  }

  it("absent : aucun point saisi", async () => {
    const points = new StoredPoints(null);
    await create(points);
    expect(points.written?.gps).toBeNull();
  });

  it("présent : l'écrit", async () => {
    const points = new StoredPoints(null);
    await create(points, { lat: 45.9, lng: 6.1 });
    expect(points.written?.gps).toEqual({ lat: 45.9, lng: 6.1 });
  });
});
