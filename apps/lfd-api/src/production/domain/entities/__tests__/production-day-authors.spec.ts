import { ProductionDayEmptyError } from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";
import { AT, LATER, opened, order } from "./production-day-fixtures.js";

describe("ProductionDay — qui a arrêté, qui a complété", () => {
  it("garde l'auteur de l'arrêt et le nom de qui complète, jusque dans l'instantané", () => {
    const day = ProductionDay.open(ServiceDay.of("2026-10-07"));
    day.close([order()], new Set<string>(), AT, {
      kind: "staff",
      staffUserId: "s-1",
      name: "Marie Dupont",
    });
    day.retake(
      [order(), order({ orderId: "ord_2" })],
      new Set<string>(),
      LATER,
      "s-2",
      "Paul Martin",
    );

    const snapshot = day.toSnapshot();
    expect(snapshot.closedBy).toEqual({ kind: "staff", staffUserId: "s-1", name: "Marie Dupont" });
    expect(snapshot.retakenByName).toBe("Paul Martin");
    const again = ProductionDay.fromSnapshot(snapshot);
    expect(again.closedBy).toEqual(snapshot.closedBy);
    expect(again.retakenByName).toBe("Paul Martin");
  });

  it("une journée ouverte n'a pas d'auteur", () => {
    expect(ProductionDay.open(ServiceDay.of("2026-10-07")).closedBy).toBeNull();
  });
});

/**
 * L'annulation staff (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4) : la
 * clôture et le retirage lisent les commandes du commerce AVANT le verrou ;
 * une annulation validée entre les deux y figure encore. C'est l'agrégat qui
 * écarte les retraits — sans double, par la règle elle-même.
 */
describe("ProductionDay — les commandes retirées par l'annulation staff", () => {
  it("la clôture n'inscrit pas une commande retirée, ni ne la compte", () => {
    const day = opened();

    day.close([order(), order({ orderId: "ord_2" })], new Set(["ord_2"]), AT, null);

    expect(day.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(day.counts).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 40, saleUnit: "piece", done: null },
    ]);
  });

  it("refuse d'arrêter une journée dont toutes les commandes sont retirées", () => {
    expect(() => opened().close([order()], new Set(["ord_1"]), AT, null)).toThrow(
      ProductionDayEmptyError,
    );
  });

  it("le retirage n'absorbe pas une commande retirée depuis l'arrêt", () => {
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);

    const absorbed = day.retake(
      [order(), order({ orderId: "ord_2" })],
      new Set(["ord_2"]),
      LATER,
      "staff-1",
      null,
    );

    expect(absorbed).toBe(0);
    expect(day.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(day.retaken).toBeNull();
  });

  it("un retrait d'une commande déjà inscrite ne la fait pas sortir du compte", () => {
    // Le guichet refuse ce cas ; s'il arrivait, une journée arrêtée ne se
    // recalcule pas pour autant — le retirage n'enlève jamais rien.
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);

    day.retake([order()], new Set(["ord_1"]), LATER, "staff-1", null);

    expect(day.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
  });
});
