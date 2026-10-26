import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { OrderHandedOverEvent } from "../../../../../handover/channels/commerce/index.js";
import {
  PackingShortfallClearedEvent,
  PackingShortfallReportedEvent,
} from "../../../../../packing/channels/commerce/index.js";
import { PackingOrderPackedEvent } from "../../../../../production/channels/commerce/index.js";
import type { DurableEvent } from "../../../../../platform/outbox/durable-event.js";
import type { DurableSubscriber } from "../../../../../platform/outbox/durable-handler.js";
import { LaterShipmentNotYetHandledError } from "../../../domain/errors/order-errors.js";
import { ensureFirstShipment } from "../later-shipment-guard.js";
import { OnOrderHandedOver } from "../on-order-handed-over.handler.js";
import { OnPackingOrderPacked } from "../on-packing-order-packed.handler.js";
import { OnPackingShortfallCleared } from "../on-packing-shortfall-cleared.handler.js";
import { OnPackingShortfallReported } from "../on-packing-shortfall-reported.handler.js";

/** Instant recopié dans le fait, jamais comparé à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const REMAINDER_RANK = 2;

type SubscriberClass = new (commands: CommandBus) => DurableSubscriber;

async function subject(handlerClass: SubscriberClass) {
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      handlerClass,
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  return { sent, handler: module.get<DurableSubscriber>(handlerClass) };
}

function factsOf(rank: number): readonly (readonly [SubscriberClass, DurableEvent])[] {
  return [
    [
      OnPackingShortfallReported,
      new PackingShortfallReportedEvent("ord_1", rank, "ORD-0001", AT, "s1", [
        { sku: "PAIN-1", due: 3, packed: 1 },
      ]),
    ],
    [OnPackingShortfallCleared, new PackingShortfallClearedEvent("ord_1", rank, "ORD-0001", AT)],
  ];
}

/**
 * Régression (plan E7 reliquat, §3 bis) : depuis L3a, ces faits portent un
 * rang, et leurs abonnés du commerce le relisaient sans s'en servir — un fait
 * de reliquat aurait rendu remise ou en manque la commande ENTIÈRE. Ignoré
 * avec trace en L3b, il est REFUSÉ depuis L4a : le message reste rejouable.
 */
describe("Abonnés du commerce face à un fait de reliquat (L3b, L4a, L4b)", () => {
  it.each(factsOf(REMAINDER_RANK).map(([cls, event]) => [cls.name, cls, event] as const))(
    "%s refuse un fait de rang 2, rejouable, sans rien demander au commerce",
    async (_name, handlerClass, event) => {
      const { sent, handler } = await subject(handlerClass);
      const fact = event.durableFact();

      await expect(
        handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload }),
      ).rejects.toBeInstanceOf(LaterShipmentNotYetHandledError);
      expect(sent).toEqual([]);
    },
  );

  it.each(factsOf(1).map(([cls, event]) => [cls.name, cls, event] as const))(
    "%s applique un fait de rang 1, comme avant",
    async (_name, handlerClass, event) => {
      const { sent, handler } = await subject(handlerClass);
      const fact = event.durableFact();

      await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });

      expect(sent).toHaveLength(1);
    },
  );

  it("OnOrderHandedOver applique un retrait de rang 1, comme avant", async () => {
    const { sent, handler } = await subject(OnOrderHandedOver);
    const fact = new OrderHandedOverEvent("ord_1", 1, "ORD-0001", AT, "s1", "scan").durableFact();

    await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });

    expect(sent).toHaveLength(1);
  });

  /**
   * Régression (L4b) : un reliquat remis ne ferme pas la commande — il
   * était refusé (L4a) ; il est laissé à son bon de livraison.
   */
  it("OnOrderHandedOver laisse le retrait d'un reliquat à son bon de livraison", async () => {
    const { sent, handler } = await subject(OnOrderHandedOver);
    const fact = new OrderHandedOverEvent(
      "ord_1",
      REMAINDER_RANK,
      "ORD-0001-2",
      AT,
      "s1",
      "scan",
    ).durableFact();

    await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });

    expect(sent).toEqual([]);
  });

  it("OnPackingOrderPacked laisse le bac d'un reliquat à son bon de livraison", async () => {
    const { sent, handler } = await subject(OnPackingOrderPacked);
    const fact = new PackingOrderPackedEvent(
      "ord_1",
      REMAINDER_RANK,
      "ORD-0001",
      AT,
      "s1",
    ).durableFact();

    await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });

    expect(sent).toEqual([]);
  });
});

describe("ensureFirstShipment", () => {
  it("laisse passer le rang 1", () => {
    expect(() => {
      ensureFirstShipment({ orderId: "ord_1", rank: 1 }, "packing.shortfall_reported", "LB");
    }).not.toThrow();
  });

  it("refuse un rang > 1 en nommant le fait, le rang, la commande et le lot", () => {
    expect(() => {
      ensureFirstShipment({ orderId: "ord_1", rank: 2 }, "packing.shortfall_reported", "LB");
    }).toThrow(/packing\.shortfall_reported.*rang 2.*ord_1.*LB/);
  });
});
