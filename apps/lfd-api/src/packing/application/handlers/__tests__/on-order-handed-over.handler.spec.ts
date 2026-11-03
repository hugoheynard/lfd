import {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
  OrderHandedOverPayloadError,
} from "../../../../handover/channels/packing/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import type { PackingSheet, PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import { InMemorySheets } from "../../__tests__/station-doubles.js";
import { OnOrderHandedOver } from "../on-order-handed-over.handler.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2030-03-12";
const HANDED_OVER_AT = new Date(1_000);

class CountingSheets extends InMemorySheets {
  saves = 0;

  override save(sheet: PackingSheet): Promise<void> {
    this.saves += 1;
    return super.save(sheet);
  }
}

function snapshot(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    withdrawnAt: null,
    ...overrides,
  };
}

function delivery(rank = 1): DurableDelivery {
  const event = new OrderHandedOverEvent(
    "ord_1",
    rank,
    "ORD-0001",
    HANDED_OVER_AT,
    "staff_counter",
    "manual",
  );
  return { eventId: "evt_1", type: HANDOVER_HANDED_OVER, payload: event.durableFact().payload };
}

describe("OnOrderHandedOver (colisage)", () => {
  it("retire la fiche d'un envoi remis sans rien au bac, signée par le retrait", async () => {
    const sheets = new CountingSheets();
    sheets.put(snapshot());

    await new OnOrderHandedOver(sheets).handle(delivery());

    expect(sheets.of(DAY, "ord_1")?.withdrawnAt).toEqual(HANDED_OVER_AT);
    expect(sheets.saves).toBe(1);
  });

  it("ferme telle quelle la fiche dont le bac porte des pièces", async () => {
    const sheets = new CountingSheets();
    sheets.put(
      snapshot({
        containerList: [
          {
            id: "c1",
            nature: "bag",
            bin: null,
            opened: { at: HANDED_OVER_AT, by: "staff_1" },
            voided: null,
            lines: [{ sku: "CRO", quantity: 2 }],
          },
        ],
      }),
    );

    await new OnOrderHandedOver(sheets).handle(delivery());

    expect(sheets.of(DAY, "ord_1")?.packed).toEqual({ at: HANDED_OVER_AT, by: "staff_counter" });
  });

  it("rejoué, n'écrit rien de plus : la fiche est déjà retirée", async () => {
    const sheets = new CountingSheets();
    sheets.put(snapshot());
    const handler = new OnOrderHandedOver(sheets);

    await handler.handle(delivery());
    await handler.handle(delivery());

    expect(sheets.saves).toBe(1);
  });

  it("ne touche pas un bac déjà fermé — la remise ordinaire", async () => {
    const sheets = new CountingSheets();
    const packed = { at: new Date(5), by: "staff_packer" };
    sheets.put(snapshot({ packed }));

    await new OnOrderHandedOver(sheets).handle(delivery());

    expect(sheets.saves).toBe(0);
    expect(sheets.of(DAY, "ord_1")?.packed).toEqual(packed);
  });

  it("sans fiche (envoi jamais inscrit au colisage), ne fait rien", async () => {
    const sheets = new CountingSheets();

    await new OnOrderHandedOver(sheets).handle(delivery());

    expect(sheets.saves).toBe(0);
  });

  it("vise l'envoi du rang remis, pas celui de la commande", async () => {
    const sheets = new CountingSheets();
    sheets.put(snapshot());
    sheets.put(snapshot({ rank: 2 }));

    await new OnOrderHandedOver(sheets).handle(delivery(2));

    expect(sheets.of(DAY, "ord_1", 2)?.withdrawnAt).toEqual(HANDED_OVER_AT);
    expect(sheets.of(DAY, "ord_1", 1)?.withdrawnAt).toBeNull();
  });

  it("un fait illisible échoue : la boîte d'envoi le reprendra", async () => {
    await expect(
      new OnOrderHandedOver(new CountingSheets()).handle({
        eventId: "evt_x",
        type: HANDOVER_HANDED_OVER,
        payload: { orderId: "ord_1" },
      }),
    ).rejects.toThrow(OrderHandedOverPayloadError);
  });
});
