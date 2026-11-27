import { noteOptionMentionOf } from "../note-option-mention.js";

const SLICED = { groupName: "Tranchage", choiceLabel: "tranché" };

describe("noteOptionMentionOf — la mention des options sur un bon", () => {
  it("une part de la ligne : le compte devant le choix", () => {
    expect(
      noteOptionMentionOf({
        sku: "PAIN",
        productName: "Pain de campagne",
        quantity: 4,
        options: [{ ...SLICED, quantity: 2 }],
      }),
    ).toBe("Tranchage : 2 × tranché");
  });

  it("au poids, le choix seul : il suit la ligne entière", () => {
    expect(
      noteOptionMentionOf({
        sku: "SEIGLE",
        productName: "Pain de seigle",
        quantity: 800,
        saleUnit: "weight",
        options: [{ ...SLICED, quantity: 800 }],
      }),
    ).toBe("Tranchage : tranché");
  });

  it("aucune option : rien, et le bon se rend comme avant", () => {
    expect(noteOptionMentionOf({ sku: "BAG", productName: "Baguette", quantity: 3 })).toBe("");
  });
});
