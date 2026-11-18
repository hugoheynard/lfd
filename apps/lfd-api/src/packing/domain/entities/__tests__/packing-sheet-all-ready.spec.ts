import { AllReadyOutsideSimplePickupError } from "../../errors/packing-all-ready-errors.js";
import { ContainersCountedError } from "../../errors/packing-container-errors.js";
import { PackingSheetWithdrawnError } from "../../errors/packing-withdrawal-errors.js";
import { PackingSheet, type PackingSheetSnapshot, type SheetMark } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const MARK: SheetMark = { at: new Date(0), by: "staff_1" };

function sheet(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    trackingLevel: "simple",
    ...overrides,
  });
}

/** Plan des niveaux de suivi du colisage, D4 : « Tout est prêt » au retrait simple seulement. */
describe("PackingSheet — « Tout est prêt » se pose-t-il ?", () => {
  it("oui sur un retrait simple, ouvert ou déjà fermé", () => {
    expect(() => sheet().assertAllReadyAllowed()).not.toThrow();
    expect(() => sheet({ packed: MARK }).assertAllReadyAllowed()).not.toThrow();
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" as const }],
    ["un retrait détaillé", { trackingLevel: "detailed" as const }],
    ["une fiche sans niveau figé", { trackingLevel: null }],
  ])("non sur %s", (_label, overrides) => {
    expect(() => sheet(overrides).assertAllReadyAllowed()).toThrow(
      AllReadyOutsideSimplePickupError,
    );
  });

  it("non sur une fiche retirée, ni sur une journée de l'ancien poste", () => {
    expect(() => sheet({ withdrawnAt: MARK.at }).assertAllReadyAllowed()).toThrow(
      PackingSheetWithdrawnError,
    );
    expect(() => sheet({ containerMode: "counted" }).assertAllReadyAllowed()).toThrow(
      ContainersCountedError,
    );
  });
});
