import { customerCancellationDeadlineOf } from "../../../domain/services/customer-cancellation-window.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { content, DAY, NEXT_DAY, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **La révision garde le délai d'annulation d'origine** (Hugo, 2026-10-26) :
 * l'équipe change le jour ou le créneau, l'instant limite se recalcule avec
 * les heures figées à la passation. La révision ne lit pas le réglage du
 * jour : aucun double de réglage n'est même monté sur la scène.
 */
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

describe("ReviseOrderHandler — le délai d'annulation figé", () => {
  it("un nouveau jour et un nouveau créneau : l'instant recalculé avec les 48 h d'origine", async () => {
    const order = await placedOrder({
      customerCancellation: { kind: "delay", hoursBefore: 48 },
      customerCancellableUntil: customerCancellationDeadlineOf(48, {
        serviceDay: DAY,
        windowStart: "07:00",
      }),
    });
    const { handler, revisions } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        STAFF,
        0,
        content({
          requestedDeliveryDate: NEXT_DAY,
          requestedWindow: { start: "09:00", end: "10:00" },
        }),
      ),
    );

    const state = revisions.saved[0]?.revision.state;
    expect(state?.customerCancellation).toEqual({ kind: "delay", hoursBefore: 48 });
    expect(state?.customerCancellableUntil).toEqual(
      customerCancellationDeadlineOf(48, { serviceDay: NEXT_DAY, windowStart: "09:00" }),
    );
  });

  it("figée sans délai : la révision la laisse sans délai ni instant", async () => {
    const order = await placedOrder({ customerCancellation: { kind: "no_delay" } });
    const { handler, revisions } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand("ord_1", STAFF, 0, content({ requestedDeliveryDate: NEXT_DAY })),
    );

    const state = revisions.saved[0]?.revision.state;
    expect(state?.customerCancellation).toEqual({ kind: "no_delay" });
    expect(state?.customerCancellableUntil).toBeNull();
  });

  it("non figée : inchangée, le réglage du jour jugera à l'annulation", async () => {
    const order = await placedOrder();
    const { handler, revisions } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand("ord_1", STAFF, 0, content({ requestedDeliveryDate: NEXT_DAY })),
    );

    const state = revisions.saved[0]?.revision.state;
    expect(state?.customerCancellation).toEqual({ kind: "not_fixed" });
    expect(state?.customerCancellableUntil).toBeNull();
  });
});
