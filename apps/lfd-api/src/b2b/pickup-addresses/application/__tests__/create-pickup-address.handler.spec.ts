import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { PickupDiscountWithoutAudienceError } from "../../domain/pickup-errors.js";
import { CreatePickupAddressCommand } from "../create-pickup-address.command.js";
import { CreatePickupAddressHandler } from "../create-pickup-address.handler.js";
import { FIELDS, StoredPoints } from "./pickup-address-doubles.js";

describe("CreatePickupAddressHandler — les clientèles de la remise", () => {
  it("refuse de créer un point dont la réduction ne vise personne", async () => {
    const points = new StoredPoints(null);
    const handler = new CreatePickupAddressHandler(
      points,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new CreatePickupAddressCommand({
          ...FIELDS,
          discount: { mode: "percent", bp: 500 },
          discountAudiences: { b2b: false, b2c: false },
        }),
      ),
    ).rejects.toBeInstanceOf(PickupDiscountWithoutAudienceError);
    expect(points.written).toBeNull();
  });
});
