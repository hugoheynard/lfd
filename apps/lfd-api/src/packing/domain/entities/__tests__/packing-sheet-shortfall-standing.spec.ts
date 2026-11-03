import { ContainersCountedError } from "../../errors/packing-container-errors.js";
import {
  NothingShortError,
  ShortfallAlreadyAuthorizedError,
} from "../../errors/packing-shortfall-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import { PackingSheetWithdrawnError } from "../../errors/packing-withdrawal-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type PackingSheetSnapshot } from "../packing-sheet.js";

/**
 * **L'aperçu de « Il manque »** (lot C1b, 2026-11-03) : la règle du geste,
 * lue sans muter — et le geste lève exactement le refus que l'aperçu dit.
 * Instants recopiés, jamais comparés à l'horloge.
 */

const AT = new Date(0);
const MARK = { at: AT, by: "staff_1" };

function bag(quantity: number): PackingContainerState {
  return {
    id: "c1",
    nature: "bag",
    bin: null,
    opened: MARK,
    voided: null,
    lines: quantity === 0 ? [] : [{ sku: "CRO", quantity }],
  };
}

function sheet(overrides: Partial<PackingSheetSnapshot> = {}, inBag = 1): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 3, packed: null, saleUnit: "piece" },
      { sku: "SAU", productName: "Saumon", quantity: 500, packed: null, saleUnit: "weight" },
    ],
    containerMode: "listed",
    containerList: [bag(inBag)],
    fulfillmentMethod: "pickup",
    withdrawnAt: null,
    ...overrides,
  });
}

describe("PackingSheet.shortfallStanding — « Il manque », sans le poser", () => {
  it("rend chaque ligne avec ce qui est au bac, unité comprise, sans muter", () => {
    const target = sheet();

    expect(target.shortfallStanding).toEqual({
      kind: "short",
      lines: [
        { sku: "CRO", productName: "Croissant", saleUnit: "piece", due: 3, packed: 1 },
        { sku: "SAU", productName: "Saumon", saleUnit: "weight", due: 500, packed: 0 },
      ],
    });
    expect(target.shortfallReportedAt).toBeNull();
  });

  it("dit une feuille retirée sans lever — c'est un accesseur, pas un geste", () => {
    expect(sheet({ withdrawnAt: AT }).shortfallStanding).toEqual({
      kind: "refused",
      refusal: "withdrawn",
    });
  });

  it.each([
    ["withdrawn", { withdrawnAt: AT }, PackingSheetWithdrawnError],
    ["sealed", { packed: MARK }, PackedOrderSealedError],
    ["counted", { containerMode: "counted" }, ContainersCountedError],
    ["already_authorized", { shortfallAuthorizedAt: AT }, ShortfallAlreadyAuthorizedError],
  ] as const)("« %s » : l'aperçu le dit, le geste le lève", (refusal, overrides, error) => {
    expect(sheet(overrides).shortfallStanding).toEqual({ kind: "refused", refusal });
    expect(() => sheet(overrides).reportShortfall(AT)).toThrow(error);
  });

  it("rien ne manque : l'aperçu le dit, le geste le lève", () => {
    const full = sheet({
      lines: [
        { sku: "CRO", productName: "Croissant", quantity: 1, packed: null, saleUnit: "piece" },
      ],
    });

    expect(full.shortfallStanding).toEqual({ kind: "refused", refusal: "nothing_short" });
    expect(() => full.reportShortfall(AT)).toThrow(NothingShortError);
  });

  it("une feuille retirée ET fermée se dit retirée — l'ordre des gardes du geste", () => {
    expect(sheet({ withdrawnAt: AT, packed: MARK }).shortfallStanding).toEqual({
      kind: "refused",
      refusal: "withdrawn",
    });
  });
});
