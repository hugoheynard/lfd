import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { HANDOVER_HANDED_OVER } from "../../../../../handover/channels/commerce/index.js";
import { RecordOrderDeliveryDayCommand } from "../../commands/record-order-delivery-day.command.js";
import { RecordDeliveryDayOnHandover } from "../record-delivery-day-on-handover.handler.js";

/** Instant recopié dans la charge, jamais comparé à l'horloge. */
const HANDED_OVER_AT = new Date("2026-10-05T07:00:00.000Z");

describe("RecordDeliveryDayOnHandover — le retrait date le bon (lot ZL)", () => {
  async function subject() {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        RecordDeliveryDayOnHandover,
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
    return { sent, handler: module.get(RecordDeliveryDayOnHandover) };
  }

  it("demande au commerce de poser le jour du bon retiré, par son identifiant", async () => {
    const { sent, handler } = await subject();
    // La charge telle que le retrait l'écrit (`OrderHandedOverEvent`).
    await handler.handle({
      eventId: "evt_1",
      type: HANDOVER_HANDED_OVER,
      payload: {
        orderId: "ord_1",
        reference: "CMD-0001",
        handedOverAt: HANDED_OVER_AT.toISOString(),
        handedOverBy: "s1",
        via: "scan",
      },
    });

    expect(sent).toEqual([new RecordOrderDeliveryDayCommand("ord_1")]);
  });

  it("une charge hors contrat échoue, visible, sans rien poser", async () => {
    const { sent, handler } = await subject();

    await expect(
      handler.handle({ eventId: "evt_1", type: HANDOVER_HANDED_OVER, payload: {} }),
    ).rejects.toThrow(/illisible/);
    expect(sent).toEqual([]);
  });
});
