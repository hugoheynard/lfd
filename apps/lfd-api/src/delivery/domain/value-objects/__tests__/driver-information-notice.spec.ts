import { CURRENT_DRIVER_NOTICE, RECEIVER_SENTENCE } from "../driver-information-notice.js";

/**
 * Le texte est tenu par `lint:rgpd-staff` pour CE qu'il annonce ; ces tests
 * tiennent ce qu'il ne doit pas dire, et ce qu'il doit dire en clair.
 */
describe("CURRENT_DRIVER_NOTICE (le texte d'information du livreur)", () => {
  const text = [
    CURRENT_DRIVER_NOTICE.intro,
    ...CURRENT_DRIVER_NOTICE.sections.flatMap((section) => [section.heading, ...section.lines]),
  ].join("\n");

  it("a une version entière positive", () => {
    expect(Number.isInteger(CURRENT_DRIVER_NOTICE.version)).toBe(true);
    expect(CURRENT_DRIVER_NOTICE.version).toBeGreaterThan(0);
  });

  it("se dit information, pas demande d'accord", () => {
    expect(text).toContain("Ce n'est pas une demande d'accord");
  });

  it("dit ce qu'on n'en fait pas : ni vitesse, ni temps de travail", () => {
    expect(text).toContain("ni à mesurer votre vitesse, ni à contrôler votre temps de travail");
  });

  it("n'invente aucune durée : elle est en cours de définition", () => {
    expect(text).toContain("en cours de définition");
    expect(text).not.toMatch(/\d+\s*jours/u);
  });

  it("donne au livreur la phrase à dire à la personne livrée", () => {
    expect(text).toContain(RECEIVER_SENTENCE);
  });

  it("n'annonce pas la position : elle n'est pas bâtie (lot 5, et une version 2)", () => {
    expect(text).toContain("ne relève pas la position");
  });

  it("chaque rubrique a un titre et au moins une ligne", () => {
    for (const section of CURRENT_DRIVER_NOTICE.sections) {
      expect(section.heading.trim()).not.toBe("");
      expect(section.lines.length).toBeGreaterThan(0);
    }
  });
});
