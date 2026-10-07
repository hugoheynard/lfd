import {
  COMMERCE_ORDER_PLACED,
  CommerceOrderPlacedFact,
  CommerceOrderPlacedPayloadError,
} from "../../../channels/commerce/index.js";
import { LocateOnOrderPlaced } from "../locate-on-order-placed.handler.js";
import { RecordingDayStopsLocator } from "./day-readiness-doubles.js";

describe("LocateOnOrderPlaced — la commande passée fait situer son adresse (CA0)", () => {
  it("demande à situer la commande du fait", async () => {
    const locator = new RecordingDayStopsLocator();
    const fact = new CommerceOrderPlacedFact("o1").durableFact();

    await new LocateOnOrderPlaced(locator).handle({ eventId: "e", ...fact });

    expect(locator.orders).toEqual(["o1"]);
    expect(locator.days).toEqual([]);
  });

  it("un fait sans commande échoue, visible, sans rien demander", async () => {
    const locator = new RecordingDayStopsLocator();

    await expect(
      new LocateOnOrderPlaced(locator).handle({
        eventId: "e",
        type: COMMERCE_ORDER_PLACED,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(CommerceOrderPlacedPayloadError);
    expect(locator.orders).toEqual([]);
  });

  it("la clé est celle de la commande : un même fait ne s'écrit qu'une fois", () => {
    expect(new CommerceOrderPlacedFact("o1").durableFact()).toEqual({
      type: COMMERCE_ORDER_PLACED,
      key: "commerce.order_placed:o1",
      payload: { orderId: "o1" },
    });
  });
});
