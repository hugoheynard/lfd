import {
  productionDossierBody,
  productionDossierSubject,
  renderProductionDossierMail,
  type ProductionDossierMailData,
} from "../production-dossier-mail.js";

/** **Le courriel du dossier de production** (doc `dossier-prod-du-jour.md`, « L'envoi par e-mail »). */

const DATA: ProductionDossierMailData = {
  firstName: "Paul",
  dayLabel: "mercredi 7 octobre 2026",
  arrestedAtLabel: "mardi 6 octobre 2026 à 20:00",
  arrestedBy: "par Marie Dupont",
  orderCount: 3,
  pickupCount: 2,
  deliveryCount: 1,
  pieceCount: 40,
  completed: false,
  pdfBase64: "JVBERi0=",
  fileName: "dossier-du-jour-2026-10-07.pdf",
};

const COMPLETED: ProductionDossierMailData = {
  ...DATA,
  completed: true,
  arrestedAtLabel: "mardi 6 octobre 2026 à 22:15",
};

describe("le courriel du dossier de production", () => {
  it("nomme le plan du jour de service dans l'objet", () => {
    expect(productionDossierSubject(DATA)).toBe(
      "Dossier de production — plan du mercredi 7 octobre 2026",
    );
  });

  it("dit « complété » dans l'objet après un retirage", () => {
    expect(productionDossierSubject(COMPLETED)).toBe(
      "Dossier de production complété — plan du mercredi 7 octobre 2026",
    );
  });

  it("salue par le prénom, ou tout court quand on ne le connaît pas", () => {
    expect(productionDossierBody(DATA)).toMatch(/^Bonjour Paul,\n/u);
    expect(productionDossierBody({ ...DATA, firstName: "" })).toMatch(/^Bonjour,\n/u);
  });

  it("dit qui a arrêté le plan, et quand", () => {
    expect(productionDossierBody(DATA)).toContain(
      "Le plan de production du mercredi 7 octobre 2026 a été arrêté par Marie Dupont " +
        "le mardi 6 octobre 2026 à 20:00.",
    );
    expect(productionDossierBody({ ...DATA, arrestedBy: "automatiquement" })).toContain(
      "a été arrêté automatiquement le mardi 6 octobre 2026 à 20:00.",
    );
    expect(productionDossierBody({ ...DATA, arrestedBy: "" })).toContain(
      "a été arrêté le mardi 6 octobre 2026 à 20:00.",
    );
  });

  it("dit le complément, et qu'il remplace le précédent, après un retirage", () => {
    const body = productionDossierBody(COMPLETED);
    expect(body).toContain(
      "Le plan du mercredi 7 octobre 2026 a été complété par Marie Dupont le mardi 6 octobre " +
        "2026 à 22:15 : de nouvelles commandes ont été ajoutées à la fournée.",
    );
    expect(body).toContain("Ce dossier remplace le précédent.");
    expect(productionDossierBody(DATA)).not.toContain("remplace");
  });

  it("dit la pièce jointe et les chiffres, retrait et livraison séparés", () => {
    const body = productionDossierBody(DATA);
    expect(body).toContain(
      "Vous trouverez en pièce jointe le dossier à imprimer : un récapitulatif de ce qu'il " +
        "faut fabriquer, puis un bon par commande.",
    );
    expect(body).toContain(
      "En chiffres : 3 commandes — 2 en retrait, 1 en livraison — et 40 pièces.",
    );
    expect(
      productionDossierBody({
        ...DATA,
        orderCount: 1,
        pickupCount: 1,
        deliveryCount: 0,
        pieceCount: 1,
      }),
    ).toContain("En chiffres : 1 commande — 1 en retrait — et 1 pièce.");
  });

  it("signe au nom du fournil", () => {
    expect(productionDossierBody(DATA).endsWith("La Folie Douce — fournil")).toBe(true);
  });

  it("met le pied de désinscription et joint le PDF sous son nom", () => {
    const seen: string[] = [];
    const mail = renderProductionDossierMail(DATA, (input) => {
      seen.push(input.footer ?? "");
      return `${input.title}|${input.body}`;
    });
    expect(seen[0]).toBe(
      "Cet e-mail part automatiquement à chaque arrêt du plan. Pour ne plus le recevoir, " +
        "demandez à l'équipe de vous retirer des destinataires (Production › Réglages).",
    );
    expect(mail.subject).toBe("Dossier de production — plan du mercredi 7 octobre 2026");
    expect(mail.attachments).toEqual([
      {
        filename: "dossier-du-jour-2026-10-07.pdf",
        contentBase64: "JVBERi0=",
        contentType: "application/pdf",
      },
    ]);
  });
});
