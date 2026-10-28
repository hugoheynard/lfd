import { WeightLotSplitError } from "../../errors/packing-sale-unit-errors.js";
import { OverAllocationError } from "../../errors/packing-container-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet } from "../packing-sheet.js";

/**
 * **Un article au poids au colisage** (plan `documentation/pricing/plan-vente-au-poids.md`,
 * P6) : il se met au bac en UN lot — un seul contenant le porte, il se retire
 * et se déplace entier — et un manque se dit en grammes.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date(0);
const MARK = { at: AT, by: "staff_1" };

function sheet(): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 12, packed: null, saleUnit: "piece" },
      {
        sku: "SAU",
        productName: "Saumon gravlax",
        quantity: 1250,
        packed: null,
        saleUnit: "weight",
      },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
}

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

function withTwoBags(): PackingSheet {
  const target = sheet();
  target.openContainer(bag("c_1"));
  target.openContainer(bag("c_2"));
  return target;
}

const lineOf = (target: PackingSheet, sku: string) => target.lines.find((line) => line.sku === sku);

describe("PackingSheet — un lot au poids", () => {
  it("pose tout le poids d'un geste, et la ligne est au bac", () => {
    const target = withTwoBags();

    expect(target.allocate("c_1", "SAU", 1250, MARK)).toBe(1250);
    expect(lineOf(target, "SAU")?.packed).toEqual({ ...MARK, initials: "" });
    expect(target.containerList[0]?.lines).toEqual([{ sku: "SAU", quantity: 1250 }]);
  });

  it("refuse de poser plus que le poids dû, en grammes", () => {
    const target = withTwoBags();

    expect(() => target.allocate("c_1", "SAU", 1251, MARK)).toThrow(OverAllocationError);
  });

  it("pose une partie du poids quand la réserve n'en tient qu'une partie, et la ligne reste ouverte", () => {
    const target = withTwoBags();

    expect(target.allocate("c_1", "SAU", 1000, MARK)).toBe(1000);
    expect(lineOf(target, "SAU")?.packed).toBeNull();
  });

  it("complète le lot dans le contenant qui le porte déjà", () => {
    const target = withTwoBags();
    target.allocate("c_1", "SAU", 1000, MARK);

    expect(target.allocate("c_1", "SAU", 250, MARK)).toBe(250);
    expect(lineOf(target, "SAU")?.packed).not.toBeNull();
  });

  it("refuse d'éparpiller le lot dans un second contenant", () => {
    const target = withTwoBags();
    target.allocate("c_1", "SAU", 1000, MARK);

    expect(() => target.allocate("c_2", "SAU", 250, MARK)).toThrow(WeightLotSplitError);
    expect(() => target.allocate("c_2", "SAU", 250, MARK)).toThrow(/un seul lot/u);
  });

  it("retire le lot entier, jamais une part de ses grammes", () => {
    const target = withTwoBags();
    target.allocate("c_1", "SAU", 1250, MARK);

    expect(() => target.withdraw("c_1", "SAU", 250)).toThrow(WeightLotSplitError);
    expect(() => target.withdraw("c_1", "SAU", 250)).toThrow(/1,25 kg, pas sur 250 g/u);
    expect(target.withdraw("c_1", "SAU", 1250)).toBe(1250);
    expect(lineOf(target, "SAU")?.packed).toBeNull();
  });

  it("déplace le lot entier, et refuse d'en déplacer une part", () => {
    const target = withTwoBags();
    target.allocate("c_1", "SAU", 1250, MARK);

    expect(() => target.move("c_1", "c_2", "SAU", 1000)).toThrow(WeightLotSplitError);
    expect(target.move("c_1", "c_2", "SAU", 1250)).toBe(1250);
    expect(target.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "SAU", quantity: 0 }],
      [{ sku: "SAU", quantity: 1250 }],
    ]);
  });

  it("les pièces de la même commande se répartissent toujours librement", () => {
    const target = withTwoBags();

    expect(target.allocate("c_1", "CRO", 5, MARK)).toBe(5);
    expect(target.allocate("c_2", "CRO", 7, MARK)).toBe(7);
    expect(target.withdraw("c_2", "CRO", 2)).toBe(2);
  });
});

describe("PackingSheet — un manque partiel au poids", () => {
  it("signale le manque en grammes : dû 1 250 g, au bac 1 000 g", () => {
    const target = withTwoBags();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "SAU", 1000, MARK);

    expect(target.reportShortfall(AT)).toEqual([
      { sku: "CRO", productName: "Croissant", due: 12, packed: 12 },
      { sku: "SAU", productName: "Saumon gravlax", due: 1250, packed: 1000 },
    ]);
  });

  it("le départ décidé réduit la ligne au poids au lot qui est au bac, et le bac se ferme", () => {
    const target = withTwoBags();
    target.allocate("c_1", "CRO", 12, MARK);
    target.allocate("c_1", "SAU", 1000, MARK);
    target.reportShortfall(AT);

    target.authorizeShortfall(
      [
        { sku: "CRO", quantity: 12 },
        { sku: "SAU", quantity: 1000 },
      ],
      MARK,
    );

    expect(lineOf(target, "SAU")).toMatchObject({ quantity: 1000, saleUnit: "weight" });
    expect(target.seal(MARK).fresh).toBe(true);
  });

  it("un lot au poids décidé à 0 g sort de la feuille, sans emporter les pièces", () => {
    const target = withTwoBags();
    target.allocate("c_1", "CRO", 12, MARK);
    target.reportShortfall(AT);

    target.authorizeShortfall(
      [
        { sku: "CRO", quantity: 12 },
        { sku: "SAU", quantity: 0 },
      ],
      MARK,
    );

    expect(target.lines.map((line) => line.sku)).toEqual(["CRO"]);
  });
});
