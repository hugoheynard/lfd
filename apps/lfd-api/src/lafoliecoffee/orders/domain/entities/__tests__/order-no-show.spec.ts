import { OrderNoShow, type OrderNoShowSnapshot } from "../order-no-show.js";
import {
  NoShowAlreadyDeclaredError,
  NoShowNoticeAlreadyRequestedError,
  NoShowNoticeRefusedError,
  NoShowRefusedError,
  NoShowTooEarlyError,
} from "../../errors/order-no-show-errors.js";

/*
 * Les instants ne sont comparés qu'entre eux — la fin du créneau de la fixture
 * et l'instant du geste —, jamais au calendrier.
 */

/** La fin du créneau de la fixture : 10:00 à Paris, 08:00 UTC en septembre. */
const SLOT_END = new Date("2026-09-11T08:00:00.000Z");
/** La fin du jour de retrait sans créneau : 23:59 à Paris. */
const DAY_END = new Date("2026-09-11T21:59:00.000Z");

function minutesAfter(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

/** Une commande à régler en boutique, prête, dont le client n'est pas venu. */
function snapshot(over: Partial<OrderNoShowSnapshot> = {}): OrderNoShowSnapshot {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
    status: "ready",
    settlementVenue: "shop_till",
    handedOver: false,
    serviceDay: "2026-09-11",
    windowEnd: "10:00",
    declared: null,
    noticeRequested: null,
    ...over,
  };
}

function declared(): OrderNoShow {
  const noShow = OrderNoShow.fromSnapshot(snapshot());
  noShow.declare(minutesAfter(SLOT_END, 30), "staff_lea", false);
  return noShow;
}

describe("« Le client n'est pas venu »", () => {
  it("pose `no_show` et la trace de qui l'a déclarée, à la fin du créneau pile", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot());

    noShow.declare(SLOT_END, "staff_lea", false);

    expect(noShow.toSnapshot()).toMatchObject({
      status: "no_show",
      declared: { at: SLOT_END, byStaffId: "staff_lea" },
      noticeRequested: null,
    });
  });

  it("se déclare aussi sur une commande pas encore prête : le créneau seul décide", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot({ status: "confirmed" }));

    noShow.declare(minutesAfter(SLOT_END, 1), "staff_lea", false);

    expect(noShow.toSnapshot().status).toBe("no_show");
  });

  it("refuse avant la fin du créneau, en disant jusqu'à quand il court", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot());

    expect(() => noShow.declare(minutesAfter(SLOT_END, -1), "staff_lea", false)).toThrow(
      NoShowTooEarlyError,
    );
    expect(() => noShow.declare(minutesAfter(SLOT_END, -1), "staff_lea", false)).toThrow(
      "court jusqu'à 10:00 le 11/09",
    );
    expect(noShow.toSnapshot().status).toBe("ready");
  });

  it("sans créneau, attend la fin du jour de retrait", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot({ windowEnd: null }));

    expect(() => noShow.declare(minutesAfter(DAY_END, -1), "staff_lea", false)).toThrow(
      NoShowTooEarlyError,
    );
    noShow.declare(DAY_END, "staff_lea", false);
    expect(noShow.toSnapshot().status).toBe("no_show");
  });

  it("refuse une commande sans jour de retrait lisible", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot({ serviceDay: null }));

    expect(() => noShow.declare(SLOT_END, "staff_lea", false)).toThrow(NoShowRefusedError);
  });

  it("refuse une commande qui ne se règle pas à la caisse de la boutique", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot({ settlementVenue: null }));

    expect(() => noShow.declare(SLOT_END, "staff_lea", false)).toThrow(
      "ne se règle pas à la caisse de la boutique",
    );
  });

  it.each([
    ["annulée", { status: "cancelled" } as const, "est annulée"],
    ["retirée", { status: "fulfilled" } as const, "a déjà été retirée"],
    ["retirée en partie", { status: "partially_handed_over" } as const, "a déjà été retirée"],
    ["projetée retirée", { handedOver: true }, "a déjà été retirée"],
    ["brouillon", { status: "draft" } as const, "n'a pas été passée"],
  ])("refuse une commande %s", (_name, over, phrase) => {
    const noShow = OrderNoShow.fromSnapshot(snapshot(over));

    expect(() => noShow.declare(SLOT_END, "staff_lea", false)).toThrow(NoShowRefusedError);
    expect(() => noShow.declare(SLOT_END, "staff_lea", false)).toThrow(phrase);
  });

  it("refuse une commande dont le retrait atteste la remise, même avant sa projection", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot());

    expect(() => noShow.declare(SLOT_END, "staff_lea", true)).toThrow("a déjà été retirée");
    expect(noShow.toSnapshot().status).toBe("ready");
  });

  it("refuse une commande déjà déclarée, sans toucher à la première trace", () => {
    const noShow = declared();

    expect(() => noShow.declare(minutesAfter(SLOT_END, 60), "staff_max", false)).toThrow(
      NoShowAlreadyDeclaredError,
    );
    expect(noShow.toSnapshot().declared).toEqual({
      at: minutesAfter(SLOT_END, 30),
      byStaffId: "staff_lea",
    });
  });
});

describe("« Prévenir le client »", () => {
  it("trace la demande sur une commande déclarée non retirée", () => {
    const noShow = declared();
    const at = minutesAfter(SLOT_END, 90);

    noShow.requestNotice(at, "staff_sup");

    expect(noShow.toSnapshot().noticeRequested).toEqual({ at, byStaffId: "staff_sup" });
  });

  it("refuse une commande qui n'est pas déclarée non retirée", () => {
    const noShow = OrderNoShow.fromSnapshot(snapshot());

    expect(() => noShow.requestNotice(SLOT_END, "staff_sup")).toThrow(NoShowNoticeRefusedError);
  });

  it("ne demande l'e-mail qu'une fois", () => {
    const noShow = declared();
    noShow.requestNotice(minutesAfter(SLOT_END, 90), "staff_sup");

    expect(() => noShow.requestNotice(minutesAfter(SLOT_END, 95), "staff_max")).toThrow(
      NoShowNoticeAlreadyRequestedError,
    );
    expect(noShow.toSnapshot().noticeRequested?.byStaffId).toBe("staff_sup");
  });
});
