import {
  productionDossierUpdatedBody,
  productionDossierUpdatedSubject,
  type ProductionDossierUpdatedMailData,
} from "../production-dossier-updated-mail.js";

const DATA: ProductionDossierUpdatedMailData = {
  firstName: "Paul",
  dayLabel: "mercredi 7 octobre 2026",
  version: 3,
  sinceVersion: 1,
  received: true,
  production: [{ productName: "Croissant", before: "120", after: "135", delta: "+15" }],
  changes: [
    {
      kind: "entered",
      shipment: { reference: "ORD-31", rank: 1 },
      reason: "retaken_off_plan",
      atLabel: "19 h 10",
    },
    { kind: "withdrawn", shipment: { reference: null, rank: 2 } },
  ],
  otherChanges: 1,
  resupplies: [],
  toCheck: [{ reference: "ORD-44", rank: 1 }],
  pdfBase64: "JVBERi0=",
  fileName: "dossier.pdf",
};

/** Le dossier mis à jour, mis en mots (lot H6) : dans l'ordre de l'écran. */
describe("l'e-mail « dossier de production mis à jour »", () => {
  it("dit le jour dans l'objet", () => {
    expect(productionDossierUpdatedSubject(DATA)).toBe(
      "Dossier de production mis à jour — plan du mercredi 7 octobre 2026",
    );
  });

  it("dit la production, puis les commandes plafonnées, puis ce qui est à vérifier", () => {
    const body = productionDossierUpdatedBody(DATA);

    expect(body).toContain("depuis la version 1 que vous avez reçue. Voici la version 3");
    const production = body.indexOf("Croissant 120 → 135, +15");
    const entered = body.indexOf("ORD-31 hors plan, intégrée au retirage de 19 h 10");
    const withdrawn = body.indexOf(
      "Une commande retirée (envoi 2) annulée après l'arrêt — toujours produite",
    );
    const others = body.indexOf("et 1 autre changement");
    const toCheck = body.indexOf("ORD-44 sortie du plan, raison au commerce");
    expect([production, entered, withdrawn, others, toCheck].every((at) => at > 0)).toBe(true);
    expect(
      production < entered && entered < withdrawn && withdrawn < others && others < toCheck,
    ).toBe(true);
  });

  it("sans version reçue, sans prénom, sans changement : le compte inchangé, contre la première version", () => {
    const body = productionDossierUpdatedBody({
      ...DATA,
      firstName: "",
      received: false,
      production: [],
      changes: [],
      otherChanges: 0,
      toCheck: [],
    });

    expect(body.startsWith("Bonjour,")).toBe(true);
    expect(body).toContain("la compare à la version 1, la première de la journée");
    expect(body).toContain("Le compte à produire n'a pas changé.");
    expect(body).not.toContain("Les commandes :");
  });
});
