import { ContainersCountedError } from "../../errors/packing-container-errors.js";
import {
  NothingShortError,
  ShortfallAlreadyAuthorizedError,
  ShortfallContentsChangedError,
  ShortfallSheetSealedError,
} from "../../errors/packing-shortfall-errors.js";
import { PackedOrderSealedError } from "../../errors/packing-station-errors.js";
import type { PackingContainerState } from "../order-contents.js";
import { PackingSheet, type ContainerMode } from "../packing-sheet.js";

/** Instants comparés entre eux, jamais à l'horloge. */
const MARK = { at: new Date(0), by: "staff_1" };
const FIRST = new Date(1_000);
const LATER = new Date(2_000);

function sheet(mode: ContainerMode = "listed", sealed = false): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: sealed ? MARK : null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 12, packed: null },
      { sku: "PAC", productName: "Pain au chocolat", quantity: 6, packed: null },
    ],
    containerMode: mode,
    containerList: [],
    fulfillmentMethod: "pickup",
  });
}

function bag(id: string): PackingContainerState {
  return { id, nature: "bag", bin: null, opened: MARK, voided: null, lines: [] };
}

/** Un bac avec 9 croissants sur 12 et les 6 pains au chocolat. */
function shortOfThree(): PackingSheet {
  const target = sheet();
  target.openContainer(bag("c_1"));
  target.allocate("c_1", "CRO", 9, MARK);
  target.allocate("c_1", "PAC", 6, MARK);
  return target;
}

describe("PackingSheet — « Il manque » (E6a)", () => {
  it("fige ce qui est au bac, ligne par ligne, complètes comprises, et retient l'instant", () => {
    const target = shortOfThree();

    expect(target.reportShortfall(FIRST)).toEqual([
      { sku: "CRO", productName: "Croissant", due: 12, packed: 9 },
      { sku: "PAC", productName: "Pain au chocolat", due: 6, packed: 6 },
    ]);
    expect(target.shortfallReportedAt).toEqual(FIRST);
    expect(target.toSnapshot().shortfallReportedAt).toEqual(FIRST);
    // La fiche reste ouverte : la pièce peut encore arriver.
    expect(target.packed).toBeNull();
  });

  it("un second signalement remplace le premier : nouvelles quantités, nouvel instant", () => {
    const target = shortOfThree();
    target.reportShortfall(FIRST);
    target.allocate("c_1", "CRO", 2, MARK);

    expect(target.reportShortfall(LATER)[0]).toEqual({
      sku: "CRO",
      productName: "Croissant",
      due: 12,
      packed: 11,
    });
    expect(target.shortfallReportedAt).toEqual(LATER);
  });

  it("une ligne vide compte zéro au bac", () => {
    expect(
      sheet()
        .reportShortfall(FIRST)
        .map((line) => line.packed),
    ).toEqual([0, 0]);
  });

  it("est refusé sur un bac complet : il ne manque rien", () => {
    const target = shortOfThree();
    target.allocate("c_1", "CRO", 3, MARK);

    expect(() => target.reportShortfall(FIRST)).toThrow(NothingShortError);
    expect(target.shortfallReportedAt).toBeNull();
  });

  it("est refusé sur un bac fermé", () => {
    expect(() => sheet("listed", true).reportShortfall(FIRST)).toThrow(PackedOrderSealedError);
  });

  it("est refusé sur une commande colisée avec l'ancien poste", () => {
    expect(() => sheet("counted").reportShortfall(FIRST)).toThrow(ContainersCountedError);
  });
});

describe("PackingSheet — la fermeture complète efface le manque (E6a)", () => {
  it("fermer complet après un signalement l'efface, et le dit", () => {
    const target = shortOfThree();
    target.reportShortfall(FIRST);
    target.allocate("c_1", "CRO", 3, MARK);

    expect(target.seal({ at: LATER, by: "s2" }).fresh).toBe(true);
    expect(target.shortfallReportedAt).toBeNull();
  });

  it("une fermeture refusée laisse le signalement en place", () => {
    const target = shortOfThree();
    target.reportShortfall(FIRST);

    expect(() => target.seal({ at: LATER, by: "s2" })).toThrow();
    expect(target.shortfallReportedAt).toEqual(FIRST);
  });
});

describe("PackingSheet — le départ incomplet décidé (E6b)", () => {
  const DECIDED = [
    { sku: "CRO", quantity: 9 },
    { sku: "PAC", quantity: 6 },
  ];

  it("réduit les lignes dues à ce qui est au bac, lève la marque, et le bac se ferme", () => {
    const target = shortOfThree();
    target.reportShortfall(FIRST);

    target.authorizeShortfall(DECIDED, { at: LATER, by: "staff_2" });

    expect(target.lines.map((line) => [line.sku, line.quantity, line.packed !== null])).toEqual([
      ["CRO", 9, true],
      ["PAC", 6, true],
    ]);
    expect(target.shortfallReportedAt).toBeNull();
    expect(target.shortfallAuthorizedAt).toEqual(LATER);
    expect(target.seal({ at: LATER, by: "staff_3" }).fresh).toBe(true);
  });

  it("refuse si le bac a changé depuis le signal", () => {
    const target = shortOfThree();
    target.reportShortfall(FIRST);
    target.allocate("c_1", "CRO", 1, MARK);

    expect(() => target.authorizeShortfall(DECIDED, { at: LATER, by: "s" })).toThrow(
      ShortfallContentsChangedError,
    );
    expect(target.lines[0]?.quantity).toBe(12);
  });

  it("refuse une décision qui ne nomme pas toutes les lignes", () => {
    const target = shortOfThree();
    expect(() =>
      target.authorizeShortfall([{ sku: "CRO", quantity: 9 }], { at: LATER, by: "s" }),
    ).toThrow(ShortfallContentsChangedError);
  });

  it("refuse un bac déjà fermé complet", () => {
    expect(() => sheet("listed", true).authorizeShortfall(DECIDED, { at: LATER, by: "s" })).toThrow(
      ShortfallSheetSealedError,
    );
  });

  it("une fiche autorisée ne se re-signale pas", () => {
    const target = shortOfThree();
    target.authorizeShortfall(DECIDED, { at: LATER, by: "s" });
    expect(() => target.reportShortfall(LATER)).toThrow(ShortfallAlreadyAuthorizedError);
  });
});
