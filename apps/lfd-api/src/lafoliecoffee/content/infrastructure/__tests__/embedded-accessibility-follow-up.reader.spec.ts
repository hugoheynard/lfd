import { InvalidAccessibilityFollowUpError } from "../../domain/errors/accessibility-follow-up-errors.js";
import {
  EmbeddedAccessibilityFollowUpReader,
  followUpViewOf,
  type EmbeddedFollowUp,
} from "../embedded-accessibility-follow-up.reader.js";

const label = { fr: "Libellé", en: "Label", it: "Etichetta" };

function embedded(status: string): EmbeddedFollowUp {
  return {
    corrections: [{ theme: 3, date: null, status, label }],
    audit: { plannedFor: null, completedOn: null },
    conformity: null,
  };
}

describe("le suivi d'accessibilité embarqué", () => {
  const view = new EmbeddedAccessibilityFollowUpReader().read();

  it("porte des corrections, chacune dans les trois langues", () => {
    expect(view.corrections.length).toBeGreaterThan(0);
    for (const correction of view.corrections) {
      expect(Object.keys(correction.label)).toEqual(["fr", "en", "it"]);
    }
  });

  it("ne cite que des thématiques RGAA (1 à 13), ou aucune", () => {
    for (const { theme } of view.corrections) {
      expect(theme === null || (theme >= 1 && theme <= 13)).toBe(true);
    }
  });

  it("ne publie aucun compte tant que l'audit n'est pas fait", () => {
    expect(view.audit.completedOn).toBeNull();
    expect(view.conformity).toBeNull();
  });
});

describe("followUpViewOf", () => {
  it("reconnaît les trois statuts du contrat", () => {
    for (const status of ["done", "in_progress", "planned"]) {
      expect(followUpViewOf(embedded(status)).corrections[0]?.status).toBe(status);
    }
  });

  it("refuse un statut inconnu, en le nommant", () => {
    expect(() => followUpViewOf(embedded("fait"))).toThrow(InvalidAccessibilityFollowUpError);
    expect(() => followUpViewOf(embedded("fait"))).toThrow(/« fait »/u);
  });
});
