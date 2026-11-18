import { ContainersCountedError } from "../../errors/packing-container-errors.js";
import {
  PackingSheetHandedOverError,
  ProblemOutsideSimplePickupError,
} from "../../errors/packing-problem-errors.js";
import { ProblemAfterDecisionError } from "../../errors/packing-problem-errors.js";
import { PackingSheetWithdrawnError } from "../../errors/packing-withdrawal-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type PackingSheetSnapshot, type SheetMark } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date(0);
const LATER = new Date(1_000);
const MARK: SheetMark = { at: AT, by: "staff_1" };

const FULL_BAG: PackingContainerState = {
  id: "c1",
  nature: "bag",
  bin: null,
  opened: MARK,
  voided: null,
  lines: [{ sku: "CRO", quantity: 4 }],
};

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

/** Plan des niveaux de suivi du colisage, D5 : une commande retirée ne se rouvre plus. */
describe("PackingSheet — retirée par le client", () => {
  it("retient l'instant du retrait sur un sac déjà fermé, et ne se rouvre plus", () => {
    const target = sheet({ packed: MARK, containerList: [FULL_BAG] });

    expect(target.leaveAtHandover({ at: LATER, by: "staff_counter" })).toBe("recorded");
    expect(target.handedOverAt).toBe(LATER);
    expect(target.toSnapshot().handedOverAt).toBe(LATER);
    expect(() => target.reopen()).toThrow(PackingSheetHandedOverError);
  });

  it("le rejeu du fait n'écrit rien de plus", () => {
    const target = sheet({ packed: MARK, containerList: [FULL_BAG], handedOverAt: AT });

    expect(target.leaveAtHandover({ at: LATER, by: "staff_counter" })).toBe("unchanged");
    expect(target.handedOverAt).toBe(AT);
  });

  it("une fiche fermée par le retrait lui-même ne se rouvre pas non plus", () => {
    const target = sheet({
      containerList: [{ ...FULL_BAG, lines: [{ sku: "CRO", quantity: 2 }] }],
    });

    expect(target.leaveAtHandover(MARK)).toBe("sealed");
    expect(() => target.reopen()).toThrow(PackingSheetHandedOverError);
  });

  it("une fiche relue retirée par le client refuse de se rouvrir", () => {
    expect(() =>
      sheet({ packed: MARK, containerList: [FULL_BAG], handedOverAt: AT }).reopen(),
    ).toThrow(PackingSheetHandedOverError);
  });

  it("une fiche jamais retirée se rouvre comme avant", () => {
    const target = sheet({ packed: MARK, containerList: [FULL_BAG] });

    expect(target.reopen()).toBe(true);
    expect(target.packed).toBeNull();
  });
});

describe("PackingSheet.assertProblemAllowed — « Problème » au niveau simple", () => {
  it("passe sur un retrait au niveau simple", () => {
    expect(() => {
      sheet().assertProblemAllowed();
    }).not.toThrow();
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" as const }],
    ["un retrait détaillé", { trackingLevel: "detailed" as const }],
    ["une fiche sans niveau figé", { trackingLevel: null }],
  ])("refuse %s", (_label, overrides) => {
    expect(() => {
      sheet(overrides).assertProblemAllowed();
    }).toThrow(ProblemOutsideSimplePickupError);
  });

  it("refuse une commande retirée par le client", () => {
    expect(() => {
      sheet({ packed: MARK, handedOverAt: AT }).assertProblemAllowed();
    }).toThrow(PackingSheetHandedOverError);
  });

  it("refuse quand le départ incomplet est déjà décidé", () => {
    expect(() => {
      sheet({ shortfallAuthorizedAt: AT }).assertProblemAllowed();
    }).toThrow(ProblemAfterDecisionError);
  });

  it("refuse une fiche comptée par l'ancien poste", () => {
    expect(() => {
      sheet({ containerMode: "counted" }).assertProblemAllowed();
    }).toThrow(ContainersCountedError);
  });

  it("refuse une feuille retirée", () => {
    expect(() => {
      sheet({ withdrawnAt: AT }).assertProblemAllowed();
    }).toThrow(PackingSheetWithdrawnError);
  });
});
