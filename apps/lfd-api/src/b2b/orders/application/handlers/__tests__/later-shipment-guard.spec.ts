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
import { appliesToOrder } from "../later-shipment-guard.js";
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
    [OnPackingOrderPacked, new PackingOrderPackedEvent("ord_1", rank, "ORD-0001", AT, "s1")],
    [OnOrderHandedOver, new OrderHandedOverEvent("ord_1", rank, "ORD-0001", AT, "s1", "scan")],
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
 * Régression (plan E7 reliquat, §3 bis) : depuis L3a, ces quatre faits portent
 * un rang, et leurs abonnés du commerce le relisaient sans s'en servir — un
 * fait de reliquat aurait rendu prête, remise ou en manque la commande ENTIÈRE.
 */
describe("Abonnés du commerce face à un fait de reliquat (L3b)", () => {
  it.each(factsOf(REMAINDER_RANK).map(([cls, event]) => [cls.name, cls, event] as const))(
    "%s ignore un fait de rang 2 sans rien demander au commerce",
    async (_name, handlerClass, event) => {
      const { sent, handler } = await subject(handlerClass);
      const fact = event.durableFact();

      await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });

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
});

describe("appliesToOrder", () => {
  function recording() {
    const warnings: string[] = [];
    return { warnings, trace: { warn: (message: string) => warnings.push(message) } };
  }

  it("laisse passer le rang 1 sans trace", () => {
    const { warnings, trace } = recording();

    expect(appliesToOrder({ orderId: "ord_1", rank: 1 }, "packing.order_packed", trace)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("écarte un rang > 1 et le dit, en nommant le fait, le rang et la commande", () => {
    const { warnings, trace } = recording();

    expect(appliesToOrder({ orderId: "ord_1", rank: 2 }, "handover.handed_over", trace)).toBe(
      false,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/handover\.handed_over.*rang 2.*ord_1/);
  });
});
