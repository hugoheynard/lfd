import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { SteppedRevisionNotices } from "../../__tests__/revision-notice-doubles.js";
import { FreshDayOrders } from "../fresh-day-orders.js";

/**
 * §9.1 du plan de modification (`documentation/commandes/plan-modifier-une-commande.md`) :
 * la clôture et le retirage lisent les commandes hors verrou, puis les
 * RELISENT sous lui si une révision a été notée entre-temps.
 */

const DAY = ServiceDay.of("2026-11-10");

function producible(quantity: number): ProducibleOrder {
  return {
    orderId: "ord_1",
    reference: "ORD-1",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

/** Le commerce, lecture après lecture : 10 croissants, puis 33 après la révision. */
class SequencedCommerce extends DayOrdersReader {
  reads = 0;

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.reads += 1;
    return Promise.resolve([producible(this.reads === 1 ? 10 : 33)]);
  }
}

describe("FreshDayOrders", () => {
  it("garde la lecture hors verrou quand le repère n'a pas bougé", async () => {
    const commerce = new SequencedCommerce();
    const fresh = new FreshDayOrders(commerce, new SteppedRevisionNotices([4, 4]));

    const read = await fresh.read(DAY);
    const kept = await fresh.underLock(DAY, read);

    expect(kept[0]?.lines[0]?.quantity).toBe(10);
    expect(commerce.reads).toBe(1);
  });

  it("relit le commerce sous le verrou quand une révision a été notée depuis", async () => {
    const commerce = new SequencedCommerce();
    const fresh = new FreshDayOrders(commerce, new SteppedRevisionNotices([null, 1]));

    const read = await fresh.read(DAY);
    const reread = await fresh.underLock(DAY, read);

    expect(reread[0]?.lines[0]?.quantity).toBe(33);
    expect(commerce.reads).toBe(2);
  });
});
