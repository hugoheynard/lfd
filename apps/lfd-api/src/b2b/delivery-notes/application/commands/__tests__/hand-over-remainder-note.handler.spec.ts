import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  DeliveryNoteTransitionRefusedError,
  HandedOverRemainderNoteNotFoundError,
} from "../../../domain/errors/delivery-note-errors.js";
import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
} from "../../__tests__/delivery-note-doubles.js";
import { HandOverRemainderNoteCommand } from "../hand-over-remainder-note.command.js";
import { HandOverRemainderNoteHandler } from "../hand-over-remainder-note.handler.js";

// Plan E7 reliquat, lot L4b : un reliquat remis passe SON BL remis, et
// seulement lui — la commande et son BL-1 restent ceux du rang 1 jusqu'à L5.

// Comparés entre eux seulement, jamais à l'horloge. Midi UTC : le jour de
// Paris est le même, quelle que soit l'heure d'été.
const CONFIRMED_AT = new Date("2030-03-11T08:00:00.000Z");
const DECIDED_AT = new Date("2030-03-11T10:00:00.000Z");
const PACKED_AT = new Date("2030-03-12T09:00:00.000Z");
const HANDED_AT = new Date("2030-03-12T12:00:00.000Z");
const LATER = new Date("2030-03-13T12:00:00.000Z");
const ORDER_DAY = "2030-03-11";
const REMAINDER_RANK = 2;

const LINE = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 2,
  lineTotalCents: 200,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

const ORDER: DeliveryNoteOrderProgress = {
  orderId: "ord_a",
  orderNumber: "ORD-a",
  lines: [LINE],
  status: "ready",
  confirmedAt: CONFIRMED_AT,
  readyAt: CONFIRMED_AT,
  handedOverAt: null,
  receivedOn: null,
  terms: ORDER_TERMS,
};

async function scene(options: { readonly remainder: boolean } = { remainder: true }) {
  const notes = new InMemoryDeliveryNotes();
  const orders = new InMemoryOrderProgress();
  orders.put(ORDER);
  await notes.save(DeliveryNote.planFromOrder("dn_1", ORDER, CONFIRMED_AT));
  if (options.remainder) {
    const source = {
      ...ORDER,
      lines: [{ ...LINE, quantity: 1, lineTotalCents: 100 }],
      orderDay: ORDER_DAY,
    };
    const remainder = DeliveryNote.planRemainder(
      "dn_2",
      source,
      REMAINDER_RANK,
      ORDER_DAY,
      DECIDED_AT,
    );
    remainder.prepare(PACKED_AT);
    await notes.save(remainder);
  }
  const handler = new HandOverRemainderNoteHandler(orders.scan, notes, new DirectUnitOfWork());
  return { notes, orders, handler };
}

function stateOf(notes: InMemoryDeliveryNotes, id: string) {
  const state = notes.rows.get(id);
  if (state === undefined) {
    throw new TypeError(`BL ${id} absent du double`);
  }
  return state;
}

const handedOver = (orderId = "ord_a", at = HANDED_AT) =>
  new HandOverRemainderNoteCommand(orderId, REMAINDER_RANK, at);

describe("HandOverRemainderNoteHandler — remis par envoi (L4b)", () => {
  it("remet le BL du reliquat à l'instant du retrait, jour de Paris, sans toucher le BL-1", async () => {
    const { notes, orders, handler } = await scene();

    await handler.execute(handedOver());

    expect(stateOf(notes, "dn_2")).toMatchObject({
      status: "handed_over",
      preparedAt: PACKED_AT,
      handedOverAt: HANDED_AT,
      receivedOn: "2030-03-12",
    });
    expect(stateOf(notes, "dn_1")).toMatchObject({ status: "planned", handedOverAt: null });
    expect(orders.locked).toEqual(["ord_a"]);
  });

  it("un second fait sur un BL déjà remis ne réécrit rien (réannonce, rejeu)", async () => {
    const { notes, handler } = await scene();
    await handler.execute(handedOver());
    const saves = notes.saves;

    await handler.execute(handedOver("ord_a", LATER));

    expect(notes.saves).toBe(saves);
    expect(stateOf(notes, "dn_2").handedOverAt).toEqual(HANDED_AT);
  });

  it("refuse, rejouable, quand la commande n'a aucun BL de ce rang", async () => {
    const { handler } = await scene({ remainder: false });

    await expect(handler.execute(handedOver())).rejects.toBeInstanceOf(
      HandedOverRemainderNoteNotFoundError,
    );
  });

  it("refuse quand la commande est inconnue", async () => {
    const { handler } = await scene();

    await expect(handler.execute(handedOver("ord_x"))).rejects.toBeInstanceOf(
      HandedOverRemainderNoteNotFoundError,
    );
  });

  it("refuse un reliquat annulé : c'est une divergence, pas un rejeu", async () => {
    const { notes, handler } = await scene();
    const [, remainder] = await notes.loadForOrders(["ord_a"]);
    remainder?.void(DECIDED_AT);
    if (remainder !== undefined) {
      await notes.save(remainder);
    }

    await expect(handler.execute(handedOver())).rejects.toBeInstanceOf(
      DeliveryNoteTransitionRefusedError,
    );
  });
});
