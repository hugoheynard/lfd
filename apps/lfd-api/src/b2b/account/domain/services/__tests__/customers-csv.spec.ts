import type { AdminCompanyView } from "@lfd/contracts";

import { customersCsv } from "../customers-csv.js";

/**
 * Ce fichier part chez le comptable et ne revient jamais nous dire qu'il est
 * cassé. Les cas visent les pannes qui ne se voient pas à l'ouverture : un SIRET
 * devenu notation scientifique, une raison sociale qui décale sa ligne, et une
 * colonne d'activation remplie pour un compte qui ne l'a jamais été.
 */
function company(over: Partial<AdminCompanyView> = {}): AdminCompanyView {
  return {
    id: "c1",
    reference: "C-000123",
    raisonSociale: "Boulangerie du Lac",
    enseigne: "Le Fournil",
    formeJuridique: "SARL",
    siret: "81245678900021",
    vatNumber: "FR12812456789",
    status: "active",
    grantedTerms: [],
    requestedTerm: null,
    primaryContact: {
      id: null,
      firstName: "Camille",
      lastName: "Roux",
      fonction: "Gérante",
      email: "camille@fournil.fr",
      phone: "0479000000",
      role: null,
    },
    owner: null,
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: "2026-06-02T08:30:00.000Z",
    activatedAt: "2026-09-01T14:00:00.000Z",
    warnings: [],
    ...over,
  };
}

function bodyLines(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/u, "")
    .trimEnd()
    .split("\r\n")
    .slice(1);
}

/**
 * **La première ligne de corps, ou un échec qui se lit.**
 *
 * `bodyLines(csv)[0]` rend `string | undefined` : un CSV sans corps donnerait
 * `undefined.endsWith(…)`, c'est-à-dire une pile qui accuse le test au lieu du
 * générateur. Refuser ici nomme la vraie panne — le CSV n'a produit aucune
 * ligne — et c'est toujours celle-là qu'on cherche.
 */
function firstBodyLine(csv: string): string {
  const [line] = bodyLines(csv);
  if (line === undefined) {
    throw new Error("le CSV ne porte aucune ligne de corps");
  }
  return line;
}

describe("customersCsv", () => {
  it("🔴 met le SIRET entre guillemets — sans quoi le tableur en fait 8,12457E+13", () => {
    // La panne la plus courante d'un CSV, et la plus silencieuse : le fichier
    // s'ouvre, la colonne est là, et le numéro est faux.
    const line = firstBodyLine(customersCsv([company()]));

    expect(line).toContain('"81245678900021"');
  });

  it("ouvre par un BOM et sépare au point-virgule", () => {
    const csv = customersCsv([company({ raisonSociale: "Crêperie Créole" })]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Crêperie Créole");
    expect(csv.split("\r\n")[0]).toContain("Référence;Raison sociale");
  });

  it("laisse la date d'activation VIDE pour un compte jamais activé", () => {
    // Y recopier la création ferait compter des clients qui n'en sont pas.
    const line = firstBodyLine(customersCsv([company({ status: "pending", activatedAt: null })]));

    expect(line.endsWith(";")).toBe(true);
    expect(line).toContain("En attente");
  });

  it("réduit les instants à des JOURS, sans conversion de fuseau", () => {
    // Le fichier sert à retrouver un dossier, pas à dater une écriture à
    // l'heure près : convertir ferait basculer d'un jour les comptes ouverts
    // après 22 h, et personne ne verrait pourquoi.
    const line = firstBodyLine(customersCsv([company()]));

    expect(line).toContain("2026-06-02");
    expect(line).toContain("2026-09-01");
    expect(line).not.toContain("T08:30");
  });

  it("dit les statuts et les délais en français", () => {
    const line = firstBodyLine(
      customersCsv([company({ status: "suspended", grantedTerms: ["monthly"] })]),
    );

    expect(line).toContain("Suspendu");
    expect(line).toContain("Mensuel");
  });

  it("échappe un point-virgule dans une raison sociale", () => {
    const line = firstBodyLine(customersCsv([company({ raisonSociale: "Dupont ; Fils" })]));

    expect(line).toContain('"Dupont ; Fils"');
  });

  it("🔴 ne porte NI téléphone NI adresse — chaque colonne est une donnée répandue", () => {
    // Ce fichier part par courriel et se copie. Le test tient la décision, pas
    // le commentaire qui l'explique : ajouter une colonne se décide.
    const csv = customersCsv([company()]);

    expect(csv).not.toContain("0479000000");
    expect(csv.split("\r\n")[0]).not.toMatch(/téléphone|adresse/iu);
    // L'e-mail, lui, est là : sans interlocuteur, une facture qui coince ne se
    // débloque pas.
    expect(csv).toContain("camille@fournil.fr");
  });

  it("rend l'en-tête seul sur un portefeuille vide", () => {
    const csv = customersCsv([]);

    expect(bodyLines(csv)).toEqual([]);
    expect(csv).toContain("Référence;Raison sociale");
  });
});
