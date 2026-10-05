import { PackingSheet, type PackingSheetSnapshot } from "../packing-sheet.js";

// Instants comparés entre eux, jamais à l'horloge.
const AT = new Date(1_000);
const LATER = new Date(2_000);

function sealedListed(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: { at: AT, by: "s1" },
    containers: 2,
    lines: [
      {
        sku: "CRO",
        productName: "Croissant",
        quantity: 4,
        packed: { at: AT, by: "s1", initials: "" },
      },
    ],
    containerMode: "listed",
    containerList: [
      {
        id: "ctn_1",
        nature: "bin",
        bin: { binId: "bin_1", code: "AB12", half: null },
        opened: { at: AT, by: "s1" },
        voided: null,
        lines: [{ sku: "CRO", quantity: 4 }],
      },
      {
        id: "ctn_2",
        nature: "bin",
        bin: { binId: "bin_2", code: "AB13", half: null },
        opened: { at: AT, by: "s1" },
        voided: { at: AT, by: "s1" },
        lines: [],
      },
    ],
    fulfillmentMethod: "delivery",
    ...overrides,
  });
}

describe("PackingSheet.reopen — rouvrir le rangement (§17.2, option b)", () => {
  it("rouvre le bac sans toucher ni aux lignes ni aux contenants", () => {
    const bac = sealedListed();

    expect(bac.reopen()).toBe(true);
    expect(bac.packed).toBeNull();
    expect(bac.lines[0]?.packed).toEqual({ at: AT, by: "s1", initials: "" });
    expect(bac.containerList).toHaveLength(2);
    expect(bac.containers).toBe(1);
  });

  it("rouvrir un bac ouvert n'a rien à faire", () => {
    const bac = sealedListed({ packed: null });

    expect(bac.reopen()).toBe(false);
    expect(bac.packed).toBeNull();
  });

  it("rouvert, le bac se remanie puis se referme sous une signature neuve", () => {
    const bac = sealedListed();
    bac.reopen();

    expect(bac.withdraw("ctn_1", "CRO", 1)).toBe(1);
    expect(bac.lines[0]?.packed).toBeNull();
    bac.allocate("ctn_1", "CRO", 1, { at: LATER, by: "s2" });

    expect(bac.seal({ at: LATER, by: "s2" })).toEqual({
      mark: { at: LATER, by: "s2" },
      fresh: true,
    });
  });

  it("ne nomme à la livraison que les bacs VIVANTS", () => {
    expect(sealedListed().liveBinIds).toEqual(["bin_1"]);
  });
});
