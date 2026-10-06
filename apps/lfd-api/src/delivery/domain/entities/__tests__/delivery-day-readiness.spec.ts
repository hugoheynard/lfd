import { DeliveryDayReadiness } from "../delivery-day-readiness.js";
import { InvalidServiceDayError } from "../../errors/delivery-round-errors.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");
const LATER = new Date("2026-10-06T18:00:00.000Z");
const AT = new Date("2026-10-06T16:00:05.000Z");

describe("DeliveryDayReadiness — l'ensemble des livraisons d'un plan arrêté", () => {
  it("une journée neuve ne sait rien : ni arrêt, ni livraison", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.closedAt).toBeNull();
    expect(day.deliveryOrderIds).toEqual([]);
    expect(day.createdAt).toBe(AT);
  });

  it("refuse un jour qui n'existe pas au calendrier", () => {
    expect(() => DeliveryDayReadiness.start("2026-02-30", AT)).toThrow(InvalidServiceDayError);
  });

  it("la clôture pose l'instant d'arrêt et rend ce qu'elle ajoute", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.learnClosure(CLOSED, ["b", "a"], AT)).toBe(2);
    expect(day.closedAt).toBe(CLOSED);
    expect(day.deliveryOrderIds).toEqual(["a", "b"]);
  });

  it("un fait rejoué n'ajoute rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a", "b"], AT);

    expect(day.learnClosure(CLOSED, ["a", "b"], LATER)).toBe(0);
    expect(day.deliveryCount).toBe(2);
  });

  it("une réannonce qui recouvre ne compte que les nouvelles", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a", "b"], AT);

    expect(day.learnClosure(CLOSED, ["b", "a", "c"], LATER)).toBe(1);
    expect(day.deliveryOrderIds).toEqual(["a", "b", "c"]);
    expect(day.updatedAt).toBe(LATER);
  });

  it("l'ensemble ne rétrécit jamais, même si un fait en porte moins", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a", "b"], AT);

    expect(day.learnClosure(CLOSED, ["a"], LATER)).toBe(0);
    expect(day.deliveryOrderIds).toEqual(["a", "b"]);
  });

  it("l'instant d'arrêt reste le premier reçu, quel que soit l'ordre d'arrivée", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a"], AT);

    day.learnClosure(LATER, ["a"], LATER);

    expect(day.closedAt).toBe(CLOSED);
  });

  it("une ligne relue sans clôture la reçoit ensuite, et l'arrêt annonce TOUT l'ensemble (CA6b)", () => {
    const day = DeliveryDayReadiness.restore({
      serviceDay: DAY,
      closedAt: null,
      deliveryOrderIds: ["z"],
      createdAt: AT,
      updatedAt: AT,
    });

    // Le retirage arrivé d'abord n'a rien annoncé : c'est l'arrêt qui dit le total.
    expect(day.learnClosure(CLOSED, ["z", "y"], LATER)).toBe(2);
    expect(day.closedAt).toBe(CLOSED);
    expect(day.createdAt).toBe(AT);
  });

  it("un retirage avant la clôture range sans arrêter, et n'annonce rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);

    expect(day.learnRetake(["r1", "r2"], AT)).toBe(0);
    expect(day.closedAt).toBeNull();
    expect(day.deliveryOrderIds).toEqual(["r1", "r2"]);
  });

  it("un retirage après la clôture annonce ses seules livraisons nouvelles", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a", "b"], AT);

    expect(day.learnRetake(["b", "c", "d"], LATER)).toBe(2);
    expect(day.deliveryOrderIds).toEqual(["a", "b", "c", "d"]);
    expect(day.closedAt).toBe(CLOSED);
    expect(day.updatedAt).toBe(LATER);
  });

  it("un retirage rejoué n'annonce rien", () => {
    const day = DeliveryDayReadiness.start(DAY, AT);
    day.learnClosure(CLOSED, ["a"], AT);
    day.learnRetake(["c"], LATER);

    expect(day.learnRetake(["c"], LATER)).toBe(0);
  });
});
