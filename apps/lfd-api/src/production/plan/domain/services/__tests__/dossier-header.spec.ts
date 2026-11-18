import { dossierHeader } from "../day-dossier-pdf.js";

/** L'en-tête de chaque page du dossier : le jour du lot et le tirage (Hugo, 2026-11-18). */
describe("dossierHeader", () => {
  it("dit le jour du lot et le tirage", () => {
    expect(dossierHeader({ serviceDay: "2026-11-18", printRun: 1 })).toMatch(
      /^Lot pour le .+ · v1$/u,
    );
    expect(dossierHeader({ serviceDay: "2026-11-18", printRun: 3 })).toMatch(/ · v3$/u);
  });
});
