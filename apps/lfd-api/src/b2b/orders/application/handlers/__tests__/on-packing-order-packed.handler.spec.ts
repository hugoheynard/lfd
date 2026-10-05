import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { PACKING_ORDER_PACKED } from "../../../../../production/channels/commerce/index.js";
import { MarkOrderReadyCommand } from "../../commands/mark-order-ready.command.js";
import { OnPackingOrderPacked } from "../on-packing-order-packed.handler.js";

/** Instant recopié, jamais comparé à l'horloge. */
const PACKED_AT = new Date("2026-09-13T05:10:00.000Z");

describe("OnPackingOrderPacked — le bac fermé AU COLISAGE (K2)", () => {
  async function subject() {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        OnPackingOrderPacked,
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
    return { sent, handler: module.get(OnPackingOrderPacked) };
  }

  it("rend la commande prête, avec l'instant et l'auteur du FAIT", async () => {
    const { sent, handler } = await subject();
    // La charge telle que le colisage l'écrit (`PackingOrderPackedEvent`).
    await handler.handle({
      eventId: "evt_1",
      type: PACKING_ORDER_PACKED,
      payload: {
        orderId: "ord_1",
        reference: "CMD-0001",
        packedAt: PACKED_AT.toISOString(),
        packedBy: "s1",
      },
    });

    expect(sent).toEqual([new MarkOrderReadyCommand("CMD-0001", "s1", PACKED_AT)]);
  });

  it("une charge hors contrat échoue, visible, sans rien demander au commerce", async () => {
    const { sent, handler } = await subject();

    await expect(
      handler.handle({ eventId: "evt_1", type: "packing.order_packed", payload: {} }),
    ).rejects.toThrow(/illisible/);
    expect(sent).toEqual([]);
  });
});
