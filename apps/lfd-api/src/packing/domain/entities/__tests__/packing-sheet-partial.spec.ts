import {
  ContainersCountedError,
  ProposalOverContainersError,
} from "../../errors/packing-container-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type ContainerMode } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const MARK = { at: new Date(0), by: "staff_1" };

function sheet(mode: ContainerMode = "listed", sealed = false): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: sealed ? MARK : null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 20, packed: null }],
    containerMode: mode,
    containerList: [],
    fulfillmentMethod: "pickup",
  });
}

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

describe("PackingSheet — le retrait partiel d'une répartition", () => {
  it("retire une partie d'un contenant sans toucher l'autre moitié de la ligne", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.openContainer(bag("c_2"));
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_2", "CRO", 8, MARK);
    expect(target.lines[0]?.packed).not.toBeNull();

    expect(target.withdraw("c_1", "CRO", 5)).toBe(5);

    expect(target.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "CRO", quantity: 7 }],
      [{ sku: "CRO", quantity: 8 }],
    ]);
    // 15 sur 20 : la ligne n'est plus au bac, et elle ne se ferme plus.
    expect(target.lines[0]?.packed).toBeNull();
  });

  it("vider un contenant d'un article laisse une ligne à zéro, et la regarnir le remet", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.allocate("c_1", "CRO", 20, MARK);

    target.withdraw("c_1", "CRO", 20);
    expect(target.containerList[0]?.lines).toEqual([{ sku: "CRO", quantity: 0 }]);

    target.allocate("c_1", "CRO", 20, MARK);
    expect(target.containerList[0]?.lines).toEqual([{ sku: "CRO", quantity: 20 }]);
    expect(target.lines[0]?.packed).not.toBeNull();
  });
});

describe("PackingSheet — « Proposer » ne s'applique qu'à une commande sans contenant", () => {
  it("est permis sur une commande ouverte, `listed`, sans contenant", () => {
    expect(() => sheet().assertCanApplyProposal()).not.toThrow();
  });

  it("est permis quand les contenants ont tous été annulés", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));
    target.voidContainer("c_1", MARK);

    expect(() => target.assertCanApplyProposal()).not.toThrow();
  });

  it("est refusé dès qu'un contenant vivant existe, en nommant le geste de sortie", () => {
    const target = sheet();
    target.openContainer(bag("c_1"));

    expect(() => target.assertCanApplyProposal()).toThrow(ProposalOverContainersError);
    expect(() => target.assertCanApplyProposal()).toThrow(/annulez ses contenants/u);
  });

  it("est refusé sur une commande fermée ou `counted`", () => {
    expect(() => sheet("listed", true).assertCanApplyProposal()).toThrow(PackedOrderSealedError);
    expect(() => sheet("counted").assertCanApplyProposal()).toThrow(ContainersCountedError);
  });
});
