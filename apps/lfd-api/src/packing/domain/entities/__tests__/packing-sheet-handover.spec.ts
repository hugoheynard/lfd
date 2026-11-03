import { PackingSheetWithdrawnError } from "../../errors/packing-withdrawal-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type SheetMark } from "../packing-sheet.js";

/**
 * **Un envoi remis sort de la liste à coliser** (Hugo, 2026-11-03, option b).
 * Instants recopiés, jamais comparés à l'horloge.
 */

const AT = new Date(0);
const MARK: SheetMark = { at: AT, by: "staff_counter" };

function container(lines: PackingContainerState["lines"], voided = false): PackingContainerState {
  return {
    id: "c1",
    nature: "bag",
    bin: null,
    opened: { at: AT, by: "staff_1" },
    voided: voided ? { at: AT, by: "staff_1" } : null,
    lines,
  };
}

function sheet(
  overrides: {
    readonly containerList?: readonly PackingContainerState[];
    readonly packed?: SheetMark | null;
    readonly withdrawnAt?: Date | null;
    readonly containerMode?: "listed" | "counted";
  } = {},
): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: overrides.packed ?? null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: overrides.containerMode ?? "listed",
    containerList: overrides.containerList ?? [],
    fulfillmentMethod: "pickup",
    withdrawnAt: overrides.withdrawnAt ?? null,
  });
}

describe("PackingSheet.leaveAtHandover — l'envoi est parti", () => {
  it("retire une feuille où rien n'est au bac : plus aucun geste ne la touche", () => {
    const target = sheet();

    expect(target.leaveAtHandover(MARK)).toBe("withdrawn");
    expect(target.withdrawnAt).toBe(AT);
    expect(target.packed).toBeNull();
    expect(() => target.seal(MARK)).toThrow(PackingSheetWithdrawnError);
  });

  it("une feuille aux contenants tous annulés se retire aussi", () => {
    const target = sheet({ containerList: [container([{ sku: "CRO", quantity: 2 }], true)] });

    expect(target.leaveAtHandover(MARK)).toBe("withdrawn");
  });

  it("ferme telle quelle une feuille dont le bac porte des pièces, même incomplète", () => {
    const target = sheet({ containerList: [container([{ sku: "CRO", quantity: 2 }])] });

    expect(target.leaveAtHandover(MARK)).toBe("sealed");
    expect(target.packed).toEqual(MARK);
    expect(target.withdrawnAt).toBeNull();
    // Rien n'est rendu : le contenant vit, ses pièces sont parties avec le client.
    expect(target.containerList[0]?.voided).toBeNull();
  });

  it("un contenant ouvert mais vide ferme la feuille plutôt que de l'annuler", () => {
    const target = sheet({ containerList: [container([])] });

    expect(target.leaveAtHandover(MARK)).toBe("sealed");
  });

  it("un bac déjà fermé ne change pas : sa signature d'origine reste", () => {
    const original: SheetMark = { at: new Date(5), by: "staff_packer" };
    const target = sheet({ packed: original });

    expect(target.leaveAtHandover(MARK)).toBe("unchanged");
    expect(target.packed).toBe(original);
  });

  it("une commande comptée par l'ancien poste reste en lecture seule", () => {
    const target = sheet({ containerMode: "counted" });

    expect(target.leaveAtHandover(MARK)).toBe("unchanged");
    expect(target.withdrawnAt).toBeNull();
  });

  it("refuse une feuille déjà retirée : l'appelant l'écarte avant", () => {
    expect(() => sheet({ withdrawnAt: AT }).leaveAtHandover(MARK)).toThrow(
      PackingSheetWithdrawnError,
    );
  });
});
