import {
  COMMERCE_ORDER_REVISED,
  CommerceOrderRevisedFact,
  CommerceOrderRevisedPayloadError,
} from "../../../channels/commerce/index.js";
import { LocateOnOrderRevised } from "../locate-on-order-revised.handler.js";
import { RecordingDayStopsLocator } from "./day-readiness-doubles.js";

describe("LocateOnOrderRevised — une commande modifiée qui change d'acheminement est située", () => {
  it("demande à situer la commande quand l'acheminement a changé", async () => {
    const locator = new RecordingDayStopsLocator();
    const fact = new CommerceOrderRevisedFact("o1", 2, true).durableFact();

    await new LocateOnOrderRevised(locator).handle({ eventId: "e", ...fact });

    expect(locator.orders).toEqual(["o1"]);
  });

  it("ne demande rien quand seuls les articles ou la note ont changé", async () => {
    const locator = new RecordingDayStopsLocator();
    const fact = new CommerceOrderRevisedFact("o1", 2, false).durableFact();

    await new LocateOnOrderRevised(locator).handle({ eventId: "e", ...fact });

    expect(locator.orders).toEqual([]);
  });

  it("un fait illisible échoue, visible, sans rien demander", async () => {
    const locator = new RecordingDayStopsLocator();

    await expect(
      new LocateOnOrderRevised(locator).handle({
        eventId: "e",
        type: COMMERCE_ORDER_REVISED,
        payload: { orderId: "o1" },
      }),
    ).rejects.toBeInstanceOf(CommerceOrderRevisedPayloadError);
    expect(locator.orders).toEqual([]);
  });

  it("la clé porte la révision : chaque modification est un fait à part", () => {
    expect(new CommerceOrderRevisedFact("o1", 2, true).durableFact()).toEqual({
      type: COMMERCE_ORDER_REVISED,
      key: "commerce.order_revised:o1:2",
      payload: { orderId: "o1", revision: 2, routeChanged: true },
    });
  });
});
