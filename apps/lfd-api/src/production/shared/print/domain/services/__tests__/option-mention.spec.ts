import { optionMentionOf } from "../option-mention.js";

describe("optionMentionOf — la mention des options sur un papier du fournil", () => {
  const SLICED = { groupName: "Tranchage", choiceLabel: "tranché" };

  it("une part de la ligne : le compte devant le choix", () => {
    expect(optionMentionOf({ quantity: 4, saleUnit: "piece" }, [{ ...SLICED, quantity: 2 }])).toBe(
      "Tranchage : 2 × tranché",
    );
  });

  it("toute la ligne, ou au poids : le choix seul", () => {
    expect(optionMentionOf({ quantity: 4, saleUnit: "piece" }, [{ ...SLICED, quantity: 4 }])).toBe(
      "Tranchage : tranché",
    );
    expect(
      optionMentionOf({ quantity: 1200, saleUnit: "weight" }, [{ ...SLICED, quantity: 1200 }]),
    ).toBe("Tranchage : tranché");
  });

  it("deux choix d'un groupe à la suite, deux groupes séparés", () => {
    expect(
      optionMentionOf({ quantity: 5, saleUnit: "piece" }, [
        { ...SLICED, quantity: 2 },
        { groupName: "Tranchage", choiceLabel: "tranché fin", quantity: 1 },
        { groupName: "Emballage", choiceLabel: "emballé", quantity: 5 },
      ]),
    ).toBe("Tranchage : 2 × tranché, 1 × tranché fin · Emballage : emballé");
  });

  it("aucune option : rien", () => {
    expect(optionMentionOf({ quantity: 4, saleUnit: "piece" }, [])).toBe("");
  });
});
