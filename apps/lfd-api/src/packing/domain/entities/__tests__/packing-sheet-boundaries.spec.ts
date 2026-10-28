import {
  ShortfallAlreadyAuthorizedError,
  ShortfallAwaitingDecisionError,
} from "../../errors/packing-shortfall-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import { PackingSheetWithdrawnError } from "../../errors/packing-withdrawal-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet } from "../packing-sheet.js";

/** Instants comparés entre eux, jamais à l'horloge. */
const MARK = { at: new Date(0), by: "staff_1" };
const FIRST = new Date(1_000);
const LATER = new Date(2_000);
const LAST = new Date(3_000);

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

function sheet(): PackingSheet {
  const target = PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 12, packed: null, saleUnit: "piece" },
      { sku: "PAC", productName: "Pain au chocolat", quantity: 6, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  target.openContainer(bag("c_1"));
  return target;
}

describe("PackingSheet — frontières de la répartition et du scellé", () => {
  it("à une pièce de la quantité due la ligne n'est pas au bac ; à la pièce exacte elle l'est", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 11, MARK);
    expect(target.lines.find((l) => l.sku === "CRO")?.packed).toBeNull();
    target.allocate("c_1", "CRO", 1, MARK);
    expect(target.lines.find((l) => l.sku === "CRO")?.packed).not.toBeNull();
  });

  it("retirer UNE pièce d'une ligne complète la remet à répartir et interdit le scellé", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "PAC", 6, MARK);
    target.withdraw("c_1", "PAC", 1);
    expect(target.lines.find((l) => l.sku === "PAC")?.packed).toBeNull();
    expect(() => target.seal(MARK)).toThrow();
    expect(target.packed).toBeNull();
  });

  it("répartir 0 ou une pièce négative ne pose rien et ne signe pas la ligne", () => {
    const target = sheet();
    for (const quantity of [0, -1]) {
      try {
        target.allocate("c_1", "CRO", quantity, MARK);
      } catch {
        // un refus est légitime ; un effet ne l'est pas
      }
    }
    expect(target.lines.find((l) => l.sku === "CRO")?.packed).toBeNull();
    expect(() => target.seal(MARK)).toThrow();
  });

  it("annuler le contenant d'une ligne complète rouvre le manque : plus de scellé", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "PAC", 6, MARK);
    target.voidContainer("c_1", MARK);
    expect(() => target.seal(MARK)).toThrow();
  });

  it("le rescan d'un bac scellé garde l'auteur et l'instant d'ORIGINE, même avec un manque déjà levé", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "PAC", 6, MARK);
    const first = target.seal({ at: FIRST, by: "a" });
    const again = target.seal({ at: LAST, by: "b" });
    expect(first.fresh).toBe(true);
    expect(again).toEqual({ mark: { at: FIRST, by: "a" }, fresh: false });
  });

  it("rouvrir puis refermer remplace la marque : le rejeu de reopen sur un bac ouvert ne change rien", () => {
    const target = sheet();
    expect(target.reopen()).toBe(false);
    expect(target.toSnapshot().packed).toBeNull();
  });

  it("un manque signalé ne contourne pas le refus quand une pièce est retirée après coup", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "PAC", 6, MARK);
    target.withdraw("c_1", "PAC", 2);
    target.reportShortfall(FIRST);
    expect(() => target.seal({ at: LATER, by: "x" })).toThrow(ShortfallAwaitingDecisionError);
  });

  it("le départ incomplet décidé garde son instant, et un bac rouvert ne se re-signale pas", () => {
    const target = sheet();
    target.allocate("c_1", "CRO", 9, MARK);
    target.allocate("c_1", "PAC", 6, MARK);
    target.reportShortfall(FIRST);
    target.authorizeShortfall(
      [
        { sku: "CRO", quantity: 9 },
        { sku: "PAC", quantity: 6 },
      ],
      { at: LATER, by: "boss" },
    );
    expect(target.shortfallReportedAt).toBeNull();
    expect(target.shortfallAuthorizedAt).toEqual(LATER);
    target.seal({ at: LAST, by: "a" });
    expect(target.shortfallAuthorizedAt).toEqual(LATER);
    target.reopen();
    expect(() => target.reportShortfall(LAST)).toThrow(ShortfallAlreadyAuthorizedError);
  });

  it("retirer une feuille déjà retirée rend false et garde l'instant d'origine, même scellée après coup", () => {
    const target = PackingSheet.fromSnapshot({
      ...sheet().toSnapshot(),
      containerList: [],
      withdrawnAt: FIRST,
    });
    expect(target.withdrawSheet(LAST)).toBe(false);
    expect(target.withdrawnAt).toEqual(FIRST);
    expect(() => target.seal(MARK)).toThrow(PackingSheetWithdrawnError);
  });

  it("un bac scellé refuse de retirer la feuille", () => {
    const target = PackingSheet.fromSnapshot({ ...sheet().toSnapshot(), packed: MARK });
    expect(() => target.withdrawSheet(LAST)).toThrow(PackedOrderSealedError);
  });
});
