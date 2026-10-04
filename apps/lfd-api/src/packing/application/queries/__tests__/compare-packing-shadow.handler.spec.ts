import {
  LegacyPackingReader,
  type LegacyPackingDay,
} from "../../../../production/channels/packing/index.js";
import { InMemoryShadow, InMemoryShadowReader } from "../../__tests__/shadow-doubles.js";
import { ComparePackingShadowHandler } from "../compare-packing-shadow.handler.js";
import { ComparePackingShadowQuery } from "../compare-packing-shadow.query.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const DAY = "2026-09-13";

/** Le fournil doublé — il ÉTEND le port publié. */
class Legacy extends LegacyPackingReader {
  constructor(private readonly day: LegacyPackingDay) {
    super();
  }

  dayOf(): Promise<LegacyPackingDay> {
    return Promise.resolve(this.day);
  }
}

const LEGACY: LegacyPackingDay = {
  serviceDay: DAY,
  orders: [
    { orderId: "a", reference: "CMD-a", dueAt: "06:00", lines: [{ sku: "CRO", quantity: 8 }] },
    { orderId: "b", reference: "CMD-b", dueAt: null, lines: [{ sku: "CRO", quantity: 4 }] },
  ],
  produced: [{ sku: "CRO", quantity: 10 }],
};

async function shadowOf(received: number, returned = 0): Promise<InMemoryShadow> {
  const shadow = new InMemoryShadow();
  for (const order of LEGACY.orders) {
    await shadow.drawOrder({
      serviceDay: DAY,
      orderId: order.orderId,
      reference: order.reference,
      customerLabel: "",
      fulfillmentMethod: "pickup",
      dueAt: order.dueAt,
      drawnAt: AT,
      containerMode: "listed",
      lines: order.lines.map((line) => ({ ...line, productName: line.sku })),
    });
  }
  await shadow.receive({
    id: "h1",
    kind: "handoff",
    serviceDay: DAY,
    sku: "CRO",
    quantity: received,
    receivedAt: AT,
  });
  if (returned > 0) {
    await shadow.receive({
      id: "r1",
      kind: "return",
      serviceDay: DAY,
      sku: "CRO",
      quantity: returned,
      receivedAt: AT,
    });
  }
  return shadow;
}

function handler(shadow: InMemoryShadow): ComparePackingShadowHandler {
  return new ComparePackingShadowHandler(new InMemoryShadowReader(shadow), new Legacy(LEGACY));
}

describe("ComparePackingShadowHandler", () => {
  it("une ombre fidèle : aucun écart, les deux stocks égaux", async () => {
    const result = await handler(await shadowOf(10)).execute(new ComparePackingShadowQuery(DAY));

    expect(result.gaps).toBe(0);
    expect(result.stocks).toEqual([{ sku: "CRO", legacy: 10, shadow: 10 }]);
    expect(result.lines.map((line) => [line.reference, line.legacy?.packable])).toEqual([
      ["CMD-a", true],
      ["CMD-b", false],
    ]);
  });

  it("une remise perdue se voit : l'écart et le stock le disent", async () => {
    const result = await handler(await shadowOf(10, 4)).execute(new ComparePackingShadowQuery(DAY));

    expect(result.gaps).toBe(1);
    expect(result.lines.find((line) => !line.matches)?.reference).toBe("CMD-a");
    expect(result.stocks).toEqual([{ sku: "CRO", legacy: 10, shadow: 6 }]);
  });

  it("une commande que l'ombre n'a pas reçue est un écart, côté ombre absent", async () => {
    const shadow = await shadowOf(10);
    shadow.orders.delete(`${DAY}/b`);

    const result = await handler(shadow).execute(new ComparePackingShadowQuery(DAY));

    expect(result.gaps).toBe(1);
    expect(result.lines.find((line) => line.reference === "CMD-b")?.shadow).toBeNull();
  });
});
