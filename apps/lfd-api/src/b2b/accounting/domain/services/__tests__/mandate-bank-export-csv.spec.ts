import { bankCell, renderMandateBankCsv, type MandateBankRow } from "../mandate-bank-export-csv.js";
import {
  debitNatureCell,
  paymentSequenceCell,
  signatureDateCell,
} from "../mandate-bank-export-values.js";

/**
 * Le fichier d'import des mandats de la banque (`ModeleImportMandats`) : 17
 * cellules, `;` après CHACUNE, CRLF, sans en-tête, ASCII. Les dates ne sont
 * comparées qu'au jour qu'elles rendent — jamais à l'horloge.
 */

const ROW: MandateBankRow = {
  reference: "LFC-9P2X4B-260915-K7M3QT",
  ics: "FR72ZZZ123456",
  debtorName: "Café de l'Isère",
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  // 22 h UTC le 14 = minuit à Paris le 15 (heure d'été).
  signedAt: new Date("2026-09-14T22:00:00.000Z"),
  paymentType: "recurrent",
  scheme: "B2B",
};

describe("les colonnes F, G, H — un seul module de traduction (A15)", () => {
  it("F : le jour de PARIS de la signature, en JJ/MM/AAAA", () => {
    expect(signatureDateCell(new Date("2026-09-14T22:00:00.000Z"))).toBe("15/09/2026");
    expect(signatureDateCell(new Date("2026-01-31T12:00:00.000Z"))).toBe("31/01/2026");
  });

  it("G : RCUR pour un mandat récurrent, OOFF pour un ponctuel", () => {
    expect(paymentSequenceCell("recurrent")).toBe("RCUR");
    expect(paymentSequenceCell("one_off")).toBe("OOFF");
  });

  it("H : le schéma figé du mandat, CORE ou B2B", () => {
    expect(debitNatureCell("CORE")).toBe("CORE");
    expect(debitNatureCell("B2B")).toBe("B2B");
  });
});

describe("le fichier", () => {
  it("écrit une ligne exacte : A à H, puis neuf cellules vides, `;` final et CRLF", () => {
    expect(renderMandateBankCsv([ROW])).toBe(
      "LFC-9P2X4B-260915-K7M3QT;FR72ZZZ123456;Cafe de l'Isere;FR7630004000031234567890143;BNPAFRPP;15/09/2026;RCUR;B2B;;;;;;;;;;\r\n",
    );
  });

  it("n'écrit aucune ligne d'en-tête, et rien du tout sans mandat", () => {
    const csv = renderMandateBankCsv([ROW, { ...ROW, reference: "RUM-2", paymentType: "one_off" }]);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv.split("\r\n")[2]).toBe("");
    expect(csv).not.toContain("Reference unique");
    expect(renderMandateBankCsv([])).toBe("");
  });

  it("chaque ligne a exactement 17 cellules", () => {
    const [first] = renderMandateBankCsv([ROW]).split("\r\n");
    expect(first?.split(";")).toHaveLength(18);
  });

  it("ne rend que de l'ASCII, même d'un nom accentué ou exotique", () => {
    const csv = renderMandateBankCsv([{ ...ROW, debtorName: "Bœuf & Crème — Ølstue « Ça »" }]);
    expect(/^[\x20-\x7E\r\n]*$/u.test(csv)).toBe(true);
  });

  it("coupe le nom du débiteur à 70 caractères", () => {
    const csv = renderMandateBankCsv([{ ...ROW, debtorName: "A".repeat(90) }]);
    expect(csv.split(";")[2]).toBe("A".repeat(70));
  });

  it("un `;` ou un guillemet dans un nom ne décale pas la ligne", () => {
    const csv = renderMandateBankCsv([{ ...ROW, debtorName: 'Bar "Le Point;Virgule"' }]);
    expect(csv.split(";")[2]).toBe("Bar Le Point Virgule");
  });
});

describe("l'injection de formule", () => {
  it.each([
    ['=HYPERLINK("x")', "HYPERLINK( x )"],
    ["+33 cafe", "33 cafe"],
    ["-2+3", "2+3"],
    ["@SUM(A1)", "SUM(A1)"],
    ["- -=x", "x"],
  ])("retire le caractère de formule en tête de « %s »", (raw, safe) => {
    expect(bankCell(raw)).toBe(safe);
  });

  it("vaut aussi pour la RUM et l'ICS", () => {
    const csv = renderMandateBankCsv([{ ...ROW, reference: "=RUM", ics: "+ICS" }]);
    expect(csv.startsWith("RUM;ICS;")).toBe(true);
  });

  it("garde un tiret au milieu d'une RUM", () => {
    expect(bankCell("LFC-9P2X4B-260915")).toBe("LFC-9P2X4B-260915");
  });
});
