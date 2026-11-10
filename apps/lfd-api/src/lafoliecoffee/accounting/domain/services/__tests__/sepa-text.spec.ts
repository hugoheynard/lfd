import { SEPA_MAX140_TEXT, SEPA_MAX35_TEXT, SEPA_NAME_MAX, sepa, sepaText } from "../sepa-text.js";

describe("sepaText", () => {
  it("translittère avant de compter : un accent compte pour une lettre", () => {
    expect(sepaText("Café de l'Isère", 10)).toBe("Cafe de l'");
  });

  it("garde un texte exactement à la limite", () => {
    const exact = "A".repeat(SEPA_NAME_MAX);

    expect(sepaText(exact, SEPA_NAME_MAX)).toBe(exact);
  });

  it("coupe le caractère de trop à limite + 1", () => {
    expect(sepaText("A".repeat(SEPA_NAME_MAX + 1), SEPA_NAME_MAX)).toHaveLength(SEPA_NAME_MAX);
  });

  it("ne laisse jamais d'espace final après la coupe", () => {
    const raw = `${"A".repeat(SEPA_NAME_MAX - 1)} B`;

    expect(sepaText(raw, SEPA_NAME_MAX)).toBe("A".repeat(SEPA_NAME_MAX - 1));
  });

  it("ne coupe jamais une entité XML : & < > deviennent des espaces avant la coupe", () => {
    const cut = sepaText("Pain & <Vin> & Co", 8);

    expect(cut).toBe("Pain Vin");
    expect(cut).not.toMatch(/[&<>]/u);
  });

  it("rend un texte court inchangé hormis le jeu SEPA", () => {
    expect(sepaText("Boulangerie du Port", SEPA_MAX140_TEXT)).toBe(sepa("Boulangerie du Port"));
  });

  it("nomme les bornes du XSD et de l'EPC", () => {
    expect([SEPA_MAX35_TEXT, SEPA_NAME_MAX, SEPA_MAX140_TEXT]).toEqual([35, 70, 140]);
  });
});
