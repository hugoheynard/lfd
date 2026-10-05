import {
  ContainersCountedError,
  InvalidContainerQuantityError,
  MoveToSameContainerError,
  PackingContainerNotFoundError,
  PackingContainerVoidedError,
  WithdrawBeyondContentError,
} from "../../errors/packing-container-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type ContainerMode } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const MARK = { at: new Date(0), by: "staff_1" };

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

/** Deux sacs : 20 croissants dus, 18 dans le premier. */
function filled(mode: ContainerMode = "listed"): PackingSheet {
  const sheet = PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 20, packed: null }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  sheet.openContainer(bag("c_1"));
  sheet.openContainer(bag("c_2"));
  sheet.openContainer(bag("c_3"));
  sheet.allocate("c_1", "CRO", 18, MARK);
  return mode === "listed"
    ? sheet
    : PackingSheet.fromSnapshot({ ...sheet.toSnapshot(), containerMode: mode });
}

function heldBy(sheet: PackingSheet): readonly number[] {
  return sheet.containerList.map((c) => c.lines.find((line) => line.sku === "CRO")?.quantity ?? 0);
}

describe("PackingSheet.move — déplacer entre deux contenants", () => {
  it("déplace les pièces sans changer le total réparti de la ligne", () => {
    const sheet = filled();

    expect(sheet.move("c_1", "c_2", "CRO", 18)).toBe(18);

    expect(heldBy(sheet)).toEqual([0, 18, 0]);
    expect(sheet.lines[0]?.packed).toBeNull();
  });

  it("garde une ligne au bac quand elle l'était", () => {
    const sheet = filled();
    sheet.allocate("c_3", "CRO", 2, MARK);
    const packed = sheet.lines[0]?.packed;

    sheet.move("c_3", "c_1", "CRO", 2);

    expect(heldBy(sheet)).toEqual([20, 0, 0]);
    expect(sheet.lines[0]?.packed).toEqual(packed);
  });

  it("refuse au-delà de ce que porte la source, et dit combien elle en porte", () => {
    const sheet = filled();

    expect(() => sheet.move("c_1", "c_2", "CRO", 19)).toThrow(WithdrawBeyondContentError);
    expect(() => sheet.move("c_1", "c_2", "CRO", 19)).toThrow(/ne porte que 18/);
    expect(heldBy(sheet)).toEqual([18, 0, 0]);
  });

  it("refuse la même source et la même cible", () => {
    expect(() => filled().move("c_1", "c_1", "CRO", 1)).toThrow(MoveToSameContainerError);
  });

  it("refuse une quantité qui n'est pas un nombre de pièces", () => {
    expect(() => filled().move("c_1", "c_2", "CRO", 0)).toThrow(InvalidContainerQuantityError);
    expect(() => filled().move("c_1", "c_2", "CRO", 1.5)).toThrow(InvalidContainerQuantityError);
  });

  it("refuse un contenant inconnu ou annulé, à la source comme à l'arrivée", () => {
    const sheet = filled();
    sheet.voidContainer("c_3", MARK);

    expect(() => sheet.move("c_1", "c_x", "CRO", 1)).toThrow(PackingContainerNotFoundError);
    expect(() => sheet.move("c_x", "c_1", "CRO", 1)).toThrow(PackingContainerNotFoundError);
    expect(() => sheet.move("c_1", "c_3", "CRO", 1)).toThrow(PackingContainerVoidedError);
    expect(() => sheet.move("c_3", "c_1", "CRO", 1)).toThrow(PackingContainerVoidedError);
    expect(heldBy(sheet)).toEqual([18, 0, 0]);
  });

  it("refuse sur une commande fermée ou colisée avec l'ancien poste", () => {
    const sealed = filled();
    sealed.allocate("c_2", "CRO", 2, MARK);
    sealed.seal(MARK);

    expect(() => sealed.move("c_1", "c_2", "CRO", 1)).toThrow(PackedOrderSealedError);
    expect(() => filled("counted").move("c_1", "c_2", "CRO", 1)).toThrow(ContainersCountedError);
  });
});
