import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  DeliveryNoteTransitionRefusedError,
  RemainderNoteNotFoundError,
} from "../../../domain/errors/delivery-note-errors.js";
import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
} from "../../__tests__/delivery-note-doubles.js";
import { RecordingDurable } from "../../../../orders/application/commands/__tests__/durable-doubles.js";
import { PrepareRemainderNoteCommand } from "../prepare-remainder-note.command.js";
import { PrepareRemainderNoteHandler } from "../prepare-remainder-note.handler.js";

// Plan E7 reliquat, choix 4 (lot L4a) : le bac d'un reliquat fermé prépare SON
// BL, et seulement lui — la commande et son BL-1 restent ceux du rang 1.

// Comparés entre eux seulement, jamais à l'horloge.
const CONFIRMED_AT = new Date(1_000);
const DECIDED_AT = new Date(3_500);
const PACKED_AT = new Date(5_000);
const LATER = new Date(6_000);
const ORDER_DAY = "1970-01-01";
const REMAINDER_RANK = 2;

const LINE = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 2,
  saleUnit: "piece" as const,
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
  const first = DeliveryNote.planFromOrder("dn_1", ORDER, CONFIRMED_AT);
  await notes.save(first);
  if (options.remainder) {
    const source = {
      ...ORDER,
      lines: [{ ...LINE, quantity: 1, lineTotalCents: 100 }],
      orderDay: ORDER_DAY,
    };
    await notes.save(
      DeliveryNote.planRemainder("dn_2", source, REMAINDER_RANK, ORDER_DAY, DECIDED_AT),
    );
  }
  const durable = new RecordingDurable();
  const handler = new PrepareRemainderNoteHandler(
    orders.scan,
    notes,
    new DirectUnitOfWork(),
    durable,
  );
  return { notes, orders, handler, durable };
}

function stateOf(notes: InMemoryDeliveryNotes, id: string) {
  const state = notes.rows.get(id);
  if (state === undefined) {
    throw new TypeError(`BL ${id} absent du double`);
  }
  return state;
}

describe("PrepareRemainderNoteHandler — prêt par envoi (L4a)", () => {
  it("prépare le BL du reliquat à l'instant du colisage, sans toucher le BL-1", async () => {
    const { notes, orders, handler } = await scene();

    await handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT));

    expect(stateOf(notes, "dn_2")).toMatchObject({ status: "prepared", preparedAt: PACKED_AT });
    expect(stateOf(notes, "dn_1")).toMatchObject({ status: "planned", preparedAt: null });
    expect(orders.locked).toEqual(["ord_a"]);
  });

  it("un second fait sur un BL déjà préparé ne réécrit rien (réannonce, rejeu)", async () => {
    const { notes, handler } = await scene();
    await handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT));
    const saves = notes.saves;

    await handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, LATER));

    expect(notes.saves).toBe(saves);
    expect(stateOf(notes, "dn_2").preparedAt).toEqual(PACKED_AT);
  });

  // Lot L4d, choix 17 : le reste prêt prévient le client, une fois.
  it("publie `order.ready` au rang du reste, et une seule fois", async () => {
    const { handler, durable } = await scene();

    await handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT));
    await handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, LATER));

    expect(durable.facts).toEqual([
      {
        type: "order.ready",
        key: "order.ready:ord_a:r2",
        payload: { orderId: "ord_a", rank: REMAINDER_RANK },
      },
    ]);
  });

  it("refuse, rejouable, quand la commande n'a aucun BL de ce rang", async () => {
    const { handler } = await scene({ remainder: false });

    await expect(
      handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT)),
    ).rejects.toBeInstanceOf(RemainderNoteNotFoundError);
  });

  it("refuse quand la commande est inconnue", async () => {
    const { handler } = await scene();

    await expect(
      handler.execute(new PrepareRemainderNoteCommand("ord_x", REMAINDER_RANK, PACKED_AT)),
    ).rejects.toBeInstanceOf(RemainderNoteNotFoundError);
  });

  it("refuse un reliquat annulé : c'est une divergence, pas un rejeu", async () => {
    const { notes, handler } = await scene();
    const [, remainder] = await notes.loadForOrders(["ord_a"]);
    remainder?.void(DECIDED_AT);
    if (remainder !== undefined) {
      await notes.save(remainder);
    }

    await expect(
      handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT)),
    ).rejects.toBeInstanceOf(DeliveryNoteTransitionRefusedError);
  });

  it("ne publie rien quand il refuse", async () => {
    const { handler, durable } = await scene({ remainder: false });

    await expect(
      handler.execute(new PrepareRemainderNoteCommand("ord_a", REMAINDER_RANK, PACKED_AT)),
    ).rejects.toBeInstanceOf(RemainderNoteNotFoundError);
    expect(durable.facts).toEqual([]);
  });
});
