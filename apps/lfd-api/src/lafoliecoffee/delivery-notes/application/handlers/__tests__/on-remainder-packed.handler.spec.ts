import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { PackingOrderPackedEvent } from "../../../../../production/channels/commerce/index.js";
import { PrepareRemainderNoteCommand } from "../../commands/prepare-remainder-note.command.js";
import { OnRemainderPacked } from "../on-remainder-packed.handler.js";

/** Instant recopié dans le fait, jamais comparé à l'horloge. */
const PACKED_AT = new Date(5_000);

describe("OnRemainderPacked — le bac d'un reliquat (L4a)", () => {
  async function subject() {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        OnRemainderPacked,
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
    return { sent, handler: module.get(OnRemainderPacked) };
  }

  async function deliver(rank: number) {
    const { sent, handler } = await subject();
    const fact = new PackingOrderPackedEvent(
      "ord_1",
      rank,
      "ORD-0001",
      PACKED_AT,
      "s1",
    ).durableFact();
    await handler.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });
    return sent;
  }

  it("prépare le BL du rang du fait, à l'instant du colisage", async () => {
    expect(await deliver(2)).toEqual([new PrepareRemainderNoteCommand("ord_1", 2, PACKED_AT)]);
  });

  it("laisse le rang 1 à la commande : rien n'est demandé", async () => {
    expect(await deliver(1)).toEqual([]);
  });
});
