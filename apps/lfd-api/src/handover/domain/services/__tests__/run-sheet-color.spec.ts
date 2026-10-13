import { runSheetColorOf } from "../run-sheet-color.js";

const COLORS = { pro: "#1e88e5", public: "#fdd835" };

describe("runSheetColorOf — la couleur d'un arrêt de la feuille de route (L5)", () => {
  it("la couleur de livraison du départ pour la clientèle", () => {
    expect(runSheetColorOf("pro", COLORS)).toBe("#1e88e5");
    expect(runSheetColorOf("public", COLORS)).toBe("#fdd835");
  });

  it("clientèle inconnue ou couleur non posée : aucune couleur", () => {
    expect(runSheetColorOf(null, COLORS)).toBeNull();
    expect(runSheetColorOf("public", { pro: "#1e88e5", public: null })).toBeNull();
  });
});
