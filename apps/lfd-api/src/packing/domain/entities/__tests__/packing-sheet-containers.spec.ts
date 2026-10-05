import {
  BagOnDeliveryError,
  ContainersCountedError,
  InvalidContainerQuantityError,
  OverAllocationError,
  PackingContainerNotFoundError,
  PackingContainerVoidedError,
  UnallocatedLinesError,
  WithdrawBeyondContentError,
} from "../../errors/packing-container-errors.js";
import {
  ContainerCeilingReachedError,
  PackedOrderSealedError,
} from "../../errors/packing-station-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { MAX_CONTAINERS_PER_ORDER, PackingSheet, type ContainerMode } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date(0);
const BY = "staff_1";
const MARK = { at: AT, by: BY };

function sheet(
  mode: ContainerMode = "listed",
  fulfillmentMethod: "pickup" | "delivery" = "pickup",
): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 20, packed: null },
      { sku: "PAC", productName: "Pain au chocolat", quantity: 4, packed: null },
    ],
    containerMode: mode,
    containerList: [],
    fulfillmentMethod,
  });
}

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

function bin(id: string, binId: string): PackingContainerState {
  return {
    id,
    nature: "bin",
    bin: { binId, code: "ABC234", half: null },
    opened: MARK,
    voided: null,
    lines: [],
  };
}

function lineOf(target: PackingSheet, sku: string) {
  return target.lines.find((line) => line.sku === sku);
}

describe("PackingSheet — la colonne Contenants (K2b)", () => {
  it("coupe une ligne entre deux contenants, et la met au bac quand tout est réparti", () => {
    const target = sheet();
    target.openContainer(bin("c_1", "b_1"));
    target.openContainer(bin("c_2", "b_2"));

    expect(target.allocate("c_1", "CRO", 10, MARK)).toBe(10);
    expect(lineOf(target, "CRO")?.packed).toBeNull();
    expect(target.allocate("c_2", "CRO", 10, MARK)).toBe(10);

    expect(lineOf(target, "CRO")?.packed).toEqual({ at: AT, by: BY, initials: "" });
    expect(target.containers).toBe(2);
    expect(target.containerList.map((c) => c.lines)).toEqual([
      [{ sku: "CRO", quantity: 10 }],
      [{ sku: "CRO", quantity: 10 }],
    ]);
  });

  it("refuse de répartir plus que ce qui reste de la ligne, et dit combien il reste", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.allocate("c_1", "CRO", 15, MARK);

    expect(() => target.allocate("c_1", "CRO", 6, MARK)).toThrow(OverAllocationError);
    expect(() => target.allocate("c_1", "CRO", 6, MARK)).toThrow(/que 5 « Croissant »/u);
  });

  it("refuse une quantité qui n'est pas un nombre entier de pièces", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));

    expect(() => target.allocate("c_1", "CRO", 0, MARK)).toThrow(InvalidContainerQuantityError);
    expect(() => target.allocate("c_1", "CRO", 1.5, MARK)).toThrow(InvalidContainerQuantityError);
  });

  it("retire d'un contenant, rend les pièces, et la ligne n'est plus au bac", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.allocate("c_1", "PAC", 4, MARK);

    expect(target.withdraw("c_1", "PAC", 1)).toBe(1);
    expect(lineOf(target, "PAC")?.packed).toBeNull();
    expect(() => target.withdraw("c_1", "PAC", 4)).toThrow(WithdrawBeyondContentError);
  });

  it("annule un contenant sans rien supprimer : ses lignes restent, ignorées, et retournent à répartir", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.allocate("c_1", "PAC", 4, MARK);

    expect(target.voidContainer("c_1", MARK)).toEqual([{ sku: "PAC", quantity: 4 }]);

    expect(target.containers).toBe(0);
    expect(target.containerList[0]).toMatchObject({
      voided: MARK,
      lines: [{ sku: "PAC", quantity: 4 }],
    });
    expect(lineOf(target, "PAC")?.packed).toBeNull();
    expect(() => target.allocate("c_1", "PAC", 1, MARK)).toThrow(PackingContainerVoidedError);
    expect(() => target.voidContainer("c_1", MARK)).toThrow(PackingContainerVoidedError);
  });

  it("une livraison se colise en bacs : un sac lui est refusé, en nommant le geste", () => {
    const target = sheet("listed", "delivery");

    expect(() => target.openContainer(bag("c_1"))).toThrow(BagOnDeliveryError);
    expect(() => target.openContainer(bag("c_1"))).toThrow(/créez un bac/u);
    target.openContainer(bin("c_2", "b_1"));
    expect(target.containers).toBe(1);
  });

  it("un contenant inconnu répond « introuvable »", () => {
    expect(() => sheet().allocate("c_x", "CRO", 1, MARK)).toThrow(PackingContainerNotFoundError);
  });

  it("refuse de fermer une commande dont une quantité n'est pas répartie, en nommant l'article", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.allocate("c_1", "CRO", 20, MARK);

    expect(() => target.seal(MARK)).toThrow(UnallocatedLinesError);
    expect(() => target.seal(MARK)).toThrow(/Pain au chocolat/u);

    target.allocate("c_1", "PAC", 4, MARK);
    expect(target.seal(MARK)).toEqual({ mark: MARK, fresh: true });
    expect(() => target.openContainer(bag("c_2"))).toThrow(PackedOrderSealedError);
    expect(() => target.withdraw("c_1", "PAC", 1)).toThrow(PackedOrderSealedError);
  });

  it("sur `counted`, la colonne est refusée : la commande est en lecture seule", () => {
    const target = sheet("counted");

    expect(() => target.openContainer(bag("c_1"))).toThrow(ContainersCountedError);
    expect(() => target.assertCanApplyProposal()).toThrow(ContainersCountedError);
  });

  it("borne le nombre de contenants vivants au plafond d'une commande", () => {
    const target = sheet();
    for (let index = 0; index < MAX_CONTAINERS_PER_ORDER; index += 1) {
      target.openContainer(bag(`c_${String(index)}`));
    }

    expect(() => target.assertCanOpenContainer()).toThrow(ContainerCeilingReachedError);
  });

  it("rend son état entier : mode, contenants, compte des vivants", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));

    expect(target.toSnapshot()).toMatchObject({
      containerMode: "listed",
      containers: 1,
      containerList: [bag("c_1")],
    });
  });
});
