import {
  RevisedDueBelowPackedError,
  RevisedDueMismatchError,
} from "../../errors/packing-revision-errors.js";
import { ShortfallAlreadyAuthorizedError } from "../../errors/packing-shortfall-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type PackingSheetSnapshot } from "../packing-sheet.js";

/**
 * La révision des lignes dues (plan A2, § 7) : mêmes articles, ≥ 1, jamais
 * sous ce qui est au bac. Instants recopiés, jamais comparés à l'horloge.
 */

const AT = new Date(0);
const MARK = { at: AT, by: "staff_rev" };
const PACKED_LINE = { at: AT, by: "staff_pack", initials: "LM" };

function bag(lines: readonly { sku: string; quantity: number }[]): PackingContainerState {
  return { id: "c1", nature: "bag", bin: null, opened: MARK, voided: null, lines };
}

function sheet(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "BAG", productName: "Baguette", quantity: 10, packed: PACKED_LINE, saleUnit: "piece" },
      { sku: "CRO", productName: "Croissant", quantity: 6, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [
      bag([
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 2 },
      ]),
    ],
    fulfillmentMethod: "pickup",
    ...overrides,
  });
}

describe("PackingSheet.reviseDue", () => {
  it("une hausse : la ligne due monte, et perd sa marque « au bac » si elle n'est plus complète", () => {
    const target = sheet();

    const changed = target.reviseDue(
      [
        { sku: "BAG", quantity: 12 },
        { sku: "CRO", quantity: 6 },
      ],
      MARK,
    );

    expect(changed).toEqual([{ sku: "BAG", productName: "Baguette", from: 10, to: 12 }]);
    expect(target.lines[0]).toEqual({
      sku: "BAG",
      productName: "Baguette",
      quantity: 12,
      saleUnit: "piece",
      packed: null,
    });
  });

  it("une baisse jusqu'à ce qui est au bac : la ligne devient complète, signée par la révision", () => {
    const target = sheet();

    target.reviseDue(
      [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 2 },
      ],
      MARK,
    );

    expect(target.lines[1]).toEqual({
      sku: "CRO",
      productName: "Croissant",
      quantity: 2,
      saleUnit: "piece",
      packed: { ...MARK, initials: "" },
    });
    expect(target.lines[0]?.packed).toEqual(PACKED_LINE);
  });

  it("rien ne change : rien n'est rendu", () => {
    expect(
      sheet().reviseDue(
        [
          { sku: "BAG", quantity: 10 },
          { sku: "CRO", quantity: 6 },
        ],
        MARK,
      ),
    ).toEqual([]);
  });

  it("refuse une baisse sous ce qui est déjà au bac, en le disant", () => {
    const target = sheet();

    expect(() =>
      target.reviseDue(
        [
          { sku: "BAG", quantity: 9 },
          { sku: "CRO", quantity: 6 },
        ],
        MARK,
      ),
    ).toThrow(RevisedDueBelowPackedError);
    expect(target.lines[0]?.quantity).toBe(10);
  });

  it.each([
    [
      "un article ajouté",
      [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 6 },
        { sku: "PAV", quantity: 1 },
      ],
    ],
    ["un article retiré", [{ sku: "BAG", quantity: 10 }]],
    [
      "une quantité à zéro",
      [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 0 },
      ],
    ],
  ])("refuse %s", (_case, lines) => {
    expect(() => sheet().reviseDue(lines, MARK)).toThrow(RevisedDueMismatchError);
  });

  it("refuse un bac fermé", () => {
    expect(() => sheet({ packed: MARK }).reviseDue([], MARK)).toThrow(PackedOrderSealedError);
  });

  it("refuse un départ incomplet décidé", () => {
    expect(() => sheet({ shortfallAuthorizedAt: AT }).reviseDue([], MARK)).toThrow(
      ShortfallAlreadyAuthorizedError,
    );
  });

  it("garde le manque signalé : fermer le bac complet l'effacera", () => {
    const target = sheet({ shortfallReportedAt: AT });

    target.reviseDue(
      [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 2 },
      ],
      MARK,
    );

    expect(target.shortfallReportedAt).toBe(AT);
  });
});
