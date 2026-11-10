import { allergenTextsOf } from "../allergen-texts.js";

describe("allergenTextsOf — les libellés par langue relus", () => {
  it("relit une carte bien formée", () => {
    const raw = {
      fr: { contains: ["Gluten"], mayContain: [] },
      en: { contains: ["Gluten"], mayContain: [] },
    };

    expect(allergenTextsOf(raw)).toEqual(raw);
  });

  it("lit NULL comme « on ne sait pas »", () => {
    expect(allergenTextsOf(null)).toBeNull();
  });

  it("fait tomber toute la carte sur une langue illisible, plutôt que de l'écarter en silence", () => {
    expect(
      allergenTextsOf({ fr: { contains: ["Gluten"], mayContain: [] }, en: { contains: [3] } }),
    ).toBeNull();
  });

  it("refuse un libellé vide", () => {
    expect(allergenTextsOf({ fr: { contains: [""], mayContain: [] } })).toBeNull();
  });
});
