import { DeliveryDayReadiness } from "../delivery-day-readiness.js";
import { InvalidServiceDayError } from "../../errors/delivery-round-errors.js";
import { ShipmentRef } from "../../../../production/channels/delivery/index.js";

/** Les envois de rang 1 de ces commandes. */
function firsts(...orderIds: readonly string[]): readonly ShipmentRef[] {
  return orderIds.map((orderId) => ShipmentRef.firstOf(orderId));
}

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");
const LATER = new Date("2026-10-06T18:00:00.000Z");
const AT = new Date("2026-10-06T16:00:05.000Z");

describe("DeliveryDayReadiness — l'ensemble des livraisons d'un plan arrêté", () => {
  it("une journée neuve ne sait rien : ni arrêt, ni livraison", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.closedAt).toBeNull();
    expect(day.shipments).toEqual(firsts());
    expect(day.createdAt).toBe(AT);
  });

  it("refuse un jour qui n'existe pas au calendrier", () => {
    expect(() => DeliveryDayReadiness.start("2026-02-30", AT)).toThrow(InvalidServiceDayError);
  });

  it("la clôture pose l'instant d'arrêt et rend ce qu'elle ajoute", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.learnClosure(CLOSED, firsts("b", "a"), AT)).toBe(2);
    expect(day.closedAt).toBe(CLOSED);
    expect(day.shipments).toEqual(firsts("a", "b"));
  });

  it("un fait rejoué n'ajoute rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a", "b"), AT);

    expect(day.learnClosure(CLOSED, firsts("a", "b"), LATER)).toBe(0);
    expect(day.deliveryCount).toBe(2);
  });

  it("une réannonce qui recouvre ne compte que les nouvelles", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a", "b"), AT);

    expect(day.learnClosure(CLOSED, firsts("b", "a", "c"), LATER)).toBe(1);
    expect(day.shipments).toEqual(firsts("a", "b", "c"));
    expect(day.updatedAt).toBe(LATER);
  });

  it("l'ensemble ne rétrécit jamais, même si un fait en porte moins", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a", "b"), AT);

    expect(day.learnClosure(CLOSED, firsts("a"), LATER)).toBe(0);
    expect(day.shipments).toEqual(firsts("a", "b"));
  });

  it("l'instant d'arrêt reste le premier reçu, quel que soit l'ordre d'arrivée", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a"), AT);

    day.learnClosure(LATER, firsts("a"), LATER);

    expect(day.closedAt).toBe(CLOSED);
  });

  it("une ligne relue sans clôture la reçoit ensuite, et l'arrêt annonce TOUT l'ensemble (CA6b)", () => {
    const day = DeliveryDayReadiness.restore({
      serviceDay: DAY,
      closedAt: null,
      shipments: firsts("z"),
      createdAt: AT,
      updatedAt: AT,
    });

    // Le retirage arrivé d'abord n'a rien annoncé : c'est l'arrêt qui dit le total.
    expect(day.learnClosure(CLOSED, firsts("z", "y"), LATER)).toBe(2);
    expect(day.closedAt).toBe(CLOSED);
    expect(day.createdAt).toBe(AT);
  });

  it("un retirage avant la clôture range sans arrêter, et n'annonce rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.learnRetake(firsts("r1", "r2"), AT)).toBe(0);
    expect(day.closedAt).toBeNull();
    expect(day.shipments).toEqual(firsts("r1", "r2"));
  });

  it("un retirage après la clôture annonce ses seules livraisons nouvelles", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a", "b"), AT);

    expect(day.learnRetake(firsts("b", "c", "d"), LATER)).toBe(2);
    expect(day.shipments).toEqual(firsts("a", "b", "c", "d"));
    expect(day.closedAt).toBe(CLOSED);
    expect(day.updatedAt).toBe(LATER);
  });

  it("un retirage rejoué n'annonce rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a"), AT);
    day.learnRetake(firsts("c"), LATER);

    expect(day.learnRetake(firsts("c"), LATER)).toBe(0);
  });
});

describe("DeliveryDayReadiness.forgetClosure (réouverture, 2026-10-14)", () => {
  it("oublie le plan, et la clôture suivante annonce tout comme une première", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, firsts("a", "b"), AT);

    day.forgetClosure(LATER);

    expect(day.closedAt).toBeNull();
    expect(day.shipments).toEqual(firsts());
    expect(day.learnClosure(LATER, firsts("b", "c"), LATER)).toBe(2);
    expect(day.closedAt).toEqual(LATER);
  });

  describe("par envoi (plan E7 reliquat, L3c)", () => {
    it("deux rangs d'une même commande sont deux livraisons", () => {
      const day = DeliveryDayReadiness.start(DAY, AT);

      expect(day.learnClosure(CLOSED, [ShipmentRef.of("a", 2), ShipmentRef.firstOf("a")], AT)).toBe(
        2,
      );

      expect(day.shipments).toEqual([ShipmentRef.firstOf("a"), ShipmentRef.of("a", 2)]);
      expect(day.deliveryCount).toBe(2);
    });

    it("un retirage qui apporte le rang 2 d'une commande déjà rangée l'annonce", () => {
      const day = DeliveryDayReadiness.start(DAY, AT);
      day.learnClosure(CLOSED, firsts("a"), AT);

      expect(day.learnRetake([ShipmentRef.firstOf("a"), ShipmentRef.of("a", 2)], LATER)).toBe(1);
    });

    it("relit ses envois sans doublon, rang compris", () => {
      const day = DeliveryDayReadiness.restore({
        serviceDay: DAY,
        closedAt: CLOSED,
        shipments: [ShipmentRef.of("a", 2), ShipmentRef.of("a", 2), ShipmentRef.firstOf("a")],
        createdAt: AT,
        updatedAt: AT,
      });

      expect(day.deliveryCount).toBe(2);
    });
  });
});
