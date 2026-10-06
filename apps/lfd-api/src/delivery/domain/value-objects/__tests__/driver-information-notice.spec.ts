import { POSITION_RETENTION_DAYS } from "../../services/position-retention.js";
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

  it("n'invente aucune durée : seule la position en a une, celle de la purge", () => {
    expect(text).toContain("en cours de définition");
    const durations = [...text.matchAll(/(\d+)\s*jours/gu)].map((match) => Number(match[1]));
    expect(durations).toEqual([POSITION_RETENTION_DAYS]);
  });

  it("donne au livreur la phrase à dire à la personne livrée", () => {
    expect(text).toContain(RECEIVER_SENTENCE);
  });

  it("v2 : PRÉVIENT de la position au geste, en fait, sans rien demander (Hugo, 2026-10-06)", () => {
    expect(CURRENT_DRIVER_NOTICE.version).toBe(2);
    expect(text).toContain(
      "La position de votre téléphone est relevée au moment de chaque geste (arrivée, remise, dépôt, clôture d'un arrêt sans remise), jamais en continu. Si le téléphone ne la donne pas, le geste est enregistré sans elle.",
    );
    expect(text).not.toContain("ne relève pas la position");
    expect(text).not.toMatch(/refus|accepter|autoris|consent/iu);
  });

  it("chaque rubrique a un titre et au moins une ligne", () => {
    for (const section of CURRENT_DRIVER_NOTICE.sections) {
      expect(section.heading.trim()).not.toBe("");
      expect(section.lines.length).toBeGreaterThan(0);
    }
  });
});
