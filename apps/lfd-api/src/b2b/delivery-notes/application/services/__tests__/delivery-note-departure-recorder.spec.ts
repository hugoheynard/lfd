import type { CartAdjustment } from "@lfd/contracts";

import {
  columnDiscounts,
  tableDiscount,
} from "../../../../orders/domain/services/__tests__/frozen-basket-discounts.fixture.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import type { DeliveryNoteSourceLine } from "../../../domain/value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../../../domain/value-objects/delivery-note-terms.js";
import { FixedBasketDiscounts, RecordingNoteDiscounts } from "../../__tests__/departure-doubles.js";
import { DeliveryNoteDepartureRecorder } from "../delivery-note-departure-recorder.js";

/** Les parts d'un bon, écrites à son départ et à lui seul (plan des promotions, § 18.2, M4). */

const TEN: CartAdjustment = { mode: "percent", bp: 1_000 };
const PLANNED_AT = new Date(0);
const HANDED_OVER_AT = new Date(3_600_000);
const RECEIVED_ON = "1970-01-01";

const LINES: readonly DeliveryNoteSourceLine[] = [
  {
    sku: "PAIN",
    productName: "Pain",
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    quantity: 10,
    saleUnit: "piece",
    lineTotalCents: 1_000,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: true,
  },
];

function noteWith(discounts: ReturnType<typeof columnDiscounts>): DeliveryNote {
  const terms = DeliveryNoteTerms.composePartial({
    orderNumber: "ORD-0001",
    lines: LINES,
    adjustments: {
      discounts,
      deliveryFee: null,
      lateFee: null,
      deliveryVatMode: null,
      exact: null,
    },
  });
  return DeliveryNote.planFromOrder(
    "dn_1",
    { orderId: "o_1", orderNumber: "ORD-0001", lines: LINES, terms },
    PLANNED_AT,
  );
}

function scene(discounts: ReturnType<typeof columnDiscounts>) {
  const writer = new RecordingNoteDiscounts();
  const recorder = new DeliveryNoteDepartureRecorder(
    new FixedBasketDiscounts(new Map([["o_1", discounts]])),
    writer,
  );
  return { writer, recorder, note: noteWith(discounts) };
}

describe("DeliveryNoteDepartureRecorder", () => {
  it("un bon qui part reçoit sa part par remise", async () => {
    const { writer, recorder, note } = scene([tableDiscount("od_1", TEN, ["PAIN"])]);
    note.handOver(HANDED_OVER_AT, RECEIVED_ON);

    await recorder.recordIfDeparted(note);

    expect(writer.byNote.get("dn_1")).toEqual([
      {
        orderDiscountId: "od_1",
        amountCents: 100,
        amountTtcCents: null,
        vatShares: [{ rate: 5.5, htCents: 100 }],
      },
    ]);
  });

  it("un bon prévu n'a pas de part : ses lignes peuvent encore changer", async () => {
    const { writer, recorder, note } = scene([tableDiscount("od_1", TEN, ["PAIN"])]);

    await recorder.recordIfDeparted(note);

    expect(writer.byNote.size).toBe(0);
  });

  it("une commande non reprise : rien n'est écrit, la reprise s'en chargera", async () => {
    const { writer, recorder, note } = scene(columnDiscounts(TEN));
    note.handOver(HANDED_OVER_AT, RECEIVED_ON);

    await recorder.recordIfDeparted(note);

    expect(writer.byNote.size).toBe(0);
  });
});
