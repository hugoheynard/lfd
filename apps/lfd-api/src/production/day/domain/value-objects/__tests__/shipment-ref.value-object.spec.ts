import { InvalidShipmentRefError } from "../../errors/production-errors.js";
import {
  FIRST_SHIPMENT_RANK,
  ShipmentRef,
  shipmentKeySuffix,
  shipmentRankOf,
} from "../shipment-ref.value-object.js";

/*
 * L'envoi `(commande, rang)` — plan E7 reliquat, choix 6 et 12. La règle de
 * sûreté : au rang 1, rien ne change (segment de clé vide).
 */
describe("ShipmentRef", () => {
  it("le rang 1 est la commande elle-même", () => {
    expect(ShipmentRef.firstOf("ord_1")).toEqual(ShipmentRef.of("ord_1", FIRST_SHIPMENT_RANK));
  });

  it.each([
    ["commande vide", "", 1],
    ["rang nul", "ord_1", 0],
    ["rang négatif", "ord_1", -1],
    ["rang décimal", "ord_1", 1.5],
  ])("refuse un envoi mal formé (%s)", (_case, orderId, rank) => {
    expect(() => ShipmentRef.of(orderId, rank)).toThrow(InvalidShipmentRefError);
  });

  it("fait l'aller-retour par sa charge, et rend `null` sur une charge hors forme", () => {
    const two = ShipmentRef.of("ord_1", 2);
    expect(ShipmentRef.fromPayload(two.toPayload())).toEqual(two);
    for (const broken of [
      null,
      [],
      { orderId: "ord_1" },
      { orderId: "", rank: 1 },
      { orderId: "o", rank: 0 },
    ]) {
      expect(ShipmentRef.fromPayload(broken)).toBeNull();
    }
  });

  it("compare par commande ET rang", () => {
    expect(ShipmentRef.firstOf("o").equals(ShipmentRef.of("o", 1))).toBe(true);
    expect(ShipmentRef.firstOf("o").equals(ShipmentRef.of("o", 2))).toBe(false);
  });
});

describe("shipmentKeySuffix — le segment de clé d'un envoi", () => {
  it("vide au rang 1 : la clé d'avant, à l'identique", () => {
    expect(shipmentKeySuffix(1)).toBe("");
    expect(ShipmentRef.firstOf("o").keySuffix()).toBe("");
  });

  it("`:r<rang>` au-delà", () => {
    expect(shipmentKeySuffix(2)).toBe(":r2");
    expect(ShipmentRef.of("o", 3).keySuffix()).toBe(":r3");
  });
});

describe("shipmentRankOf — relire un rang de charge", () => {
  it("absent → rang 1 (fait écrit avant le reliquat)", () => {
    expect(shipmentRankOf(undefined)).toBe(1);
  });

  it("un entier ≥ 1 → lui ; autre chose → null", () => {
    expect(shipmentRankOf(2)).toBe(2);
    for (const broken of [0, -1, 1.5, "2", null]) {
      expect(shipmentRankOf(broken)).toBeNull();
    }
  });
});
