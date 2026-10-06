import {
  productionDossierBody,
  productionDossierSubject,
  renderProductionDossierMail,
  type ProductionDossierMailData,
} from "../production-dossier-mail.js";

/** **Le courriel du dossier du jour** (plan `plan-envoi-du-dossier.md`, E3). */

const DATA: ProductionDossierMailData = {
  firstName: "Paul",
  dayLabel: "mardi 14 octobre",
  orderCount: 3,
  pieceCount: 40,
  completed: false,
  pdfBase64: "JVBERi0=",
  fileName: "dossier-du-jour-2026-10-14.pdf",
};

describe("le courriel du dossier du jour", () => {
  it("annonce le jour, les commandes et les pièces dans l'objet", () => {
    expect(productionDossierSubject(DATA)).toBe(
      "Dossier du mardi 14 octobre — 3 commandes, 40 pièces",
    );
    expect(productionDossierSubject({ ...DATA, orderCount: 1, pieceCount: 1 })).toBe(
      "Dossier du mardi 14 octobre — 1 commande, 1 pièce",
    );
  });

  it("dit « complété » après un retirage, dans l'objet comme dans le corps", () => {
    const completed = { ...DATA, completed: true };
    expect(productionDossierSubject(completed)).toBe(
      "Dossier du mardi 14 octobre — 3 commandes, 40 pièces — complété",
    );
    expect(productionDossierBody(completed)).toContain("dossier complété");
  });

  it("salue par le prénom, ou tout court quand on ne le connaît pas", () => {
    expect(productionDossierBody(DATA)).toMatch(/^Bonjour Paul,/u);
    expect(productionDossierBody({ ...DATA, firstName: "" })).toMatch(/^Bonjour,/u);
  });

  it("joint le PDF sous son nom, en pièce ordinaire (pas en ligne)", () => {
    const mail = renderProductionDossierMail(DATA, (input) => `${input.title}|${input.body}`);
    expect(mail.attachments).toEqual([
      {
        filename: "dossier-du-jour-2026-10-14.pdf",
        contentBase64: "JVBERi0=",
        contentType: "application/pdf",
      },
    ]);
    expect(mail.html).toContain("Dossier du mardi 14 octobre");
  });
});
