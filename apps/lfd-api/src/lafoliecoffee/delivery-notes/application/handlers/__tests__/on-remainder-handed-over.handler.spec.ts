import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { OrderHandedOverEvent } from "../../../../../handover/channels/commerce/index.js";
import { HandOverRemainderNoteCommand } from "../../commands/hand-over-remainder-note.command.js";
import { OnRemainderHandedOver } from "../on-remainder-handed-over.handler.js";

/** Instant recopié dans le fait, jamais comparé à l'horloge. */
const HANDED_AT = new Date(5_000);

describe("OnRemainderHandedOver — le retrait d'un reliquat (L4b)", () => {
  async function deliver(rank: number) {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        OnRemainderHandedOver,
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
    const fact = new OrderHandedOverEvent(
      "ord_1",
      rank,
      rank === 1 ? "ORD-0001" : "ORD-0001-2",
      HANDED_AT,
      "s1",
      "scan",
    ).durableFact();
    await module
      .get(OnRemainderHandedOver)
      .handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });
    return sent;
  }

  it("remet le BL du rang du fait, à l'instant du retrait", async () => {
    expect(await deliver(2)).toEqual([
      new HandOverRemainderNoteCommand("ord_1", 2, HANDED_AT, "s1", "scan"),
    ]);
  });

  it("laisse le rang 1 à la commande : rien n'est demandé", async () => {
    expect(await deliver(1)).toEqual([]);
  });
});
