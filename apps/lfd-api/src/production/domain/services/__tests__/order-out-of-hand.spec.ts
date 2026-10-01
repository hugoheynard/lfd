import {
  QualityOrderDepartedError,
  QualityOrderHandedOverError,
} from "../../errors/quality-record-errors.js";
import { refuseOrderOutOfHand } from "../order-out-of-hand.js";
import type { ScopedQualityTarget } from "../quality-check-scope.js";

const ORDER: ScopedQualityTarget = {
  target: { kind: "order", orderId: "ord_2" },
  label: "ORD-0002",
};
const LINE: ScopedQualityTarget = {
  target: { kind: "line", sku: "VIE-001", quantitySeen: 16 },
  label: "VIE-001",
};

describe("refuseOrderOutOfHand — on ne juge que ce qu'on a sous les yeux (BQ)", () => {
  it("une commande partie : « La commande est partie : le produit n'est plus là. »", () => {
    expect(() => refuseOrderOutOfHand(ORDER, "departed")).toThrow(QualityOrderDepartedError);
    expect(() => refuseOrderOutOfHand(ORDER, "departed")).toThrow(
      "La commande est partie : le produit n'est plus là. ORD-0002 a quitté le dépôt avec sa tournée.",
    );
  });

  it("une commande retirée : refusée, et c'est le dernier état qui parle", () => {
    expect(() => refuseOrderOutOfHand(ORDER, "handed_over")).toThrow(QualityOrderHandedOverError);
  });

  it("une commande toujours là : rien à refuser", () => {
    expect(() => refuseOrderOutOfHand(ORDER, undefined)).not.toThrow();
  });

  it("une ligne n'est jamais refusée : elle juge un lot, pas une commande", () => {
    expect(() => refuseOrderOutOfHand(LINE, "departed")).not.toThrow();
    expect(() => refuseOrderOutOfHand(LINE, "handed_over")).not.toThrow();
  });
});
