import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { DeliveryOrderPlacedListener } from "../../../../../delivery/channels/commerce/index.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import { TellDeliveryOrderPlaced } from "../tell-delivery-order-placed.handler.js";

class RecordingListener extends DeliveryOrderPlacedListener {
  readonly placed: string[] = [];
  orderPlaced(orderId: string): void {
    this.placed.push(orderId);
  }
}

describe("TellDeliveryOrderPlaced — la livraison apprend la commande (CA0)", () => {
  it("passe l'identifiant, et rien d'autre, sans rien trier", async () => {
    const listener = new RecordingListener();
    const work = new BackgroundWork();

    new TellDeliveryOrderPlaced(listener, work).handle(
      new OrderPlacedEvent("o1", "CMD-1", "u1", null, 1200),
    );
    await work.whenIdle();

    expect(listener.placed).toEqual(["o1"]);
  });
});
