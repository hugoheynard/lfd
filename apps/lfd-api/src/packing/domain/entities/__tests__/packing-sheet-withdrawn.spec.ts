import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import {
  PackingSheetHasLiveContainersError,
  PackingSheetWithdrawnError,
} from "../../errors/packing-withdrawal-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet } from "../packing-sheet.js";

/**
 * **Une feuille retirée ne bouge plus** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.3). Instants recopiés, jamais comparés à l'horloge.
 */

const AT = new Date(0);
const MARK = { at: AT, by: "staff_1" };

function sheet(
  overrides: {
    readonly withdrawnAt?: Date | null;
    readonly containerList?: readonly PackingContainerState[];
    readonly packed?: { readonly at: Date; readonly by: string } | null;
  } = {},
): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: overrides.packed ?? null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: "listed",
    containerList: overrides.containerList ?? [],
    fulfillmentMethod: "pickup",
    withdrawnAt: overrides.withdrawnAt ?? null,
  });
}

/**
 * Ce que le prototype porte et qui n'est PAS un geste : la photographie, le
 * retrait lui-même (idempotent), et les aides privées que les gestes appellent
 * APRÈS leur garde. Une méthode publique neuve n'est pas ici : elle doit
 * porter la garde, ou ce test rougit.
 */
const NOT_A_GESTURE: ReadonlySet<string> = new Set([
  "constructor",
  "toSnapshot",
  "withdrawSheet",
  "listedLine",
  "markByAllocation",
  "assertAllAllocated",
  "assertListedAndOpen",
  "assertListed",
  "assertNotWithdrawn",
  "assertOpen",
  "replaceLine",
]);

function gestures(): readonly string[] {
  return Object.getOwnPropertyNames(PackingSheet.prototype).filter((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(PackingSheet.prototype, name);
    return (
      descriptor !== undefined && typeof descriptor.value === "function" && !NOT_A_GESTURE.has(name)
    );
  });
}

describe("PackingSheet — une feuille retirée (plan A1, § 2.3)", () => {
  it("le prototype porte bien les gestes du plan (la liste n'est pas vide par accident)", () => {
    expect(gestures()).toEqual(
      expect.arrayContaining([
        "seal",
        "reportShortfall",
        "authorizeShortfall",
        "reopen",
        "openContainer",
        "allocate",
        "withdraw",
        "move",
        "voidContainer",
        "assertCanApplyProposal",
        "assertCanOpenContainer",
      ]),
    );
  });

  it.each(gestures())("« %s » refuse une feuille retirée", (name) => {
    const target = sheet({ withdrawnAt: AT });
    const method: unknown = Reflect.get(PackingSheet.prototype, name);
    if (typeof method !== "function") {
      throw new TypeError(`${name} n'est pas une méthode`);
    }

    expect(() => {
      Reflect.apply(method, target, []);
    }).toThrow(PackingSheetWithdrawnError);
  });

  it("retire une feuille ouverte sans contenant vivant, une fois", () => {
    const target = sheet();

    expect(target.withdrawSheet(AT)).toBe(true);
    expect(target.withdrawnAt).toBe(AT);
    expect(target.toSnapshot().withdrawnAt).toBe(AT);
    expect(target.withdrawSheet(new Date(1))).toBe(false);
    expect(target.withdrawnAt).toBe(AT);
  });

  it("une feuille dont les contenants sont annulés se retire", () => {
    const voided: PackingContainerState = {
      id: "c1",
      nature: "bag",
      bin: null,
      opened: MARK,
      voided: MARK,
      lines: [{ sku: "CRO", quantity: 4 }],
    };

    expect(sheet({ containerList: [voided] }).withdrawSheet(AT)).toBe(true);
  });

  it("refuse tant qu'un contenant vit : le geste les annule d'abord", () => {
    const live: PackingContainerState = {
      id: "c1",
      nature: "bag",
      bin: null,
      opened: MARK,
      voided: null,
      lines: [],
    };

    expect(() => sheet({ containerList: [live] }).withdrawSheet(AT)).toThrow(
      PackingSheetHasLiveContainersError,
    );
  });

  it("refuse une feuille fermée : la commande est prête", () => {
    expect(() => sheet({ packed: MARK }).withdrawSheet(AT)).toThrow(PackedOrderSealedError);
  });
});
