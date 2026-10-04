import { ProductionDay } from "../../entities/production-day.js";
import { QualityCheck } from "../../entities/quality-check.js";
import {
  QualityLineNotCountedError,
  QualityOrderNotInPlanError,
  QualityOrderNotPackedError,
} from "../../errors/quality-record-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import {
  isSameQualityIntent,
  plannedLinesOf,
  type QualityCheckIntent,
  scopeQualityTarget,
} from "../quality-check-scope.js";

const DAY = ServiceDay.of("2026-10-01");
const AT = new Date();

function day(packed: boolean): ProductionDay {
  const open = ProductionDay.open(DAY);
  open.close(
    [
      {
        orderId: "ord_1",
        reference: "ORD-0001",
        customerLabel: "Trois Ponts",
        fulfillmentMethod: "pickup",
        destination: "Le Labo",
        dueAt: null,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
      },
    ],
    AT,
  );
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    orders: snapshot.orders.map((o) => (packed ? { ...o, packed: { at: AT, by: "p" } } : o)),
  });
}

describe("scopeQualityTarget", () => {
  it("une ligne prend sa quantité au compte ; une commande colisée se nomme par sa référence", () => {
    expect(scopeQualityTarget(day(true), { kind: "line", sku: "VIE-001" })).toEqual({
      target: { kind: "line", sku: "VIE-001", quantitySeen: 12 },
      label: "VIE-001",
    });
    expect(scopeQualityTarget(day(true), { kind: "order", orderId: "ord_1" })).toEqual({
      target: { kind: "order", orderId: "ord_1" },
      label: "ORD-0001",
    });
  });

  it("refuse une ligne hors compte, une journée ouverte, une commande hors plan ou pas colisée", () => {
    expect(() => scopeQualityTarget(day(true), { kind: "line", sku: "X" })).toThrow(
      QualityLineNotCountedError,
    );
    expect(() =>
      scopeQualityTarget(ProductionDay.open(DAY), { kind: "line", sku: "VIE-001" }),
    ).toThrow(QualityLineNotCountedError);
    expect(() => scopeQualityTarget(day(true), { kind: "order", orderId: "ord_9" })).toThrow(
      QualityOrderNotInPlanError,
    );
    expect(() => scopeQualityTarget(day(false), { kind: "order", orderId: "ord_1" })).toThrow(
      QualityOrderNotPackedError,
    );
  });

  it("le plan se lit en lignes (commande, SKU)", () => {
    expect(plannedLinesOf(day(false))).toEqual([{ orderId: "ord_1", sku: "VIE-001" }]);
  });
});

describe("isSameQualityIntent", () => {
  const intent: QualityCheckIntent = {
    id: "chk",
    serviceDay: DAY,
    target: { kind: "line", sku: "VIE-001" },
    verdict: "warning",
    note: "  Dorure pâle ",
    checkedBy: "staff_sup",
    uploadIds: ["up_1"],
  };
  const existing = QualityCheck.render({
    id: "chk",
    serviceDay: DAY,
    target: { kind: "line", sku: "VIE-001", quantitySeen: 12 },
    verdict: "warning",
    note: "Dorure pâle",
    checkedBy: "staff_sup",
    checkedAt: AT,
    photos: [
      { position: 0, storageKey: "k", uploadId: "up_1", contentType: "image/jpeg", byteSize: 3 },
    ],
  });

  it("le même contenu, note bornée comprise", () => {
    expect(isSameQualityIntent(existing, intent)).toBe(true);
  });

  it.each([
    ["un autre verdict", { verdict: "blocking" as const }],
    ["une autre note", { note: "Brûlés" }],
    ["une autre cible", { target: { kind: "order" as const, orderId: "ord_1" } }],
    ["d'autres photos", { uploadIds: ["up_2"] }],
    ["un autre auteur", { checkedBy: "staff_x" }],
    ["une autre journée", { serviceDay: ServiceDay.of("2026-10-02") }],
  ])("%s n'est pas un rejeu", (_, change) => {
    expect(isSameQualityIntent(existing, { ...intent, ...change })).toBe(false);
  });
});
