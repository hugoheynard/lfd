import {
  BankExportDebtorNameTooLongError,
  BankExportTooManyMandatesError,
} from "../../errors/mandate-bank-export-errors.js";
import { bankCell, renderMandateBankCsv, type MandateBankRow } from "../mandate-bank-export-csv.js";
import {
  debitNatureCell,
  paymentSequenceCell,
  signatureDateCell,
} from "../mandate-bank-export-values.js";

/**
 * Le fichier d'import des mandats de la banque (modèle CENET) : 18
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

describe("les colonnes F, G, H — un seul module de traduction (réponse 10 de la banque)", () => {
  /** Régression : F partait en JJ/MM/AAAA, la banque attend AAAAMMJJ (2026-10-23). */
  it("F : le jour de PARIS de la signature, en AAAAMMJJ — la banque refuserait JJ/MM/AAAA", () => {
    expect(signatureDateCell(new Date("2026-09-14T22:00:00.000Z"))).toBe("20260915");
    expect(signatureDateCell(new Date("2026-01-31T12:00:00.000Z"))).toBe("20260131");
  });

  /** Régression : G partait en RCUR/OOFF, codes du pain.008, pas du modèle (2026-10-23). */
  it("G : RECURRENT ou PONCTUEL — la banque refuserait RCUR et OOFF", () => {
    expect(paymentSequenceCell("recurrent")).toBe("RECURRENT");
    expect(paymentSequenceCell("one_off")).toBe("PONCTUEL");
  });

  it("H : le schéma figé du mandat, CORE ou B2B", () => {
    expect(debitNatureCell("CORE")).toBe("CORE");
    expect(debitNatureCell("B2B")).toBe("B2B");
  });
});

describe("le fichier", () => {
  it("écrit une ligne exacte : A à H, I et J vides, K et L, M à R vides, `;` final et CRLF", () => {
    expect(renderMandateBankCsv([ROW])).toBe(
      "LFC-9P2X4B-260915-K7M3QT;FR72ZZZ123456;Cafe de l'Isere;FR7630004000031234567890143;BNPAFRPP;20260915;RECURRENT;B2B;;;O;N;;;;;;;\r\n",
    );
  });

  /** Régression : K et L, obligatoires (jaunes) au modèle, partaient vides (2026-10-23). */
  it("la banque refuserait K ou L vide : K vaut O, L vaut N", () => {
    const cells = renderMandateBankCsv([ROW]).split(";");
    expect(cells[10]).toBe("O");
    expect(cells[11]).toBe("N");
  });

  it("n'écrit aucune ligne d'en-tête, et rien du tout sans mandat", () => {
    const csv = renderMandateBankCsv([ROW, { ...ROW, reference: "RUM-2", paymentType: "one_off" }]);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv.split("\r\n")[2]).toBe("");
    expect(csv).not.toContain("Reference unique");
    expect(renderMandateBankCsv([])).toBe("");
  });

  /** Régression : 17 cellules (A à Q), le modèle en a 18 (A à R) (2026-10-23). */
  it("chaque ligne a exactement 18 cellules, R comprise", () => {
    const [first] = renderMandateBankCsv([ROW]).split("\r\n");
    expect(first?.split(";")).toHaveLength(19);
  });

  it("accepte 200 lignes et refuse la 201ᵉ : la banque rejetterait le fichier", () => {
    const rows = (count: number): MandateBankRow[] =>
      Array.from({ length: count }, (_, rank) => ({ ...ROW, reference: `RUM-${rank}` }));
    expect(renderMandateBankCsv(rows(200)).split("\r\n")).toHaveLength(201);
    expect(() => renderMandateBankCsv(rows(201))).toThrow(BankExportTooManyMandatesError);
  });

  it("ne rend que de l'ASCII, même d'un nom accentué ou exotique", () => {
    const csv = renderMandateBankCsv([{ ...ROW, debtorName: "Bœuf & Crème — Ølstue « Ça »" }]);
    expect(/^[\x20-\x7E\r\n]*$/u.test(csv)).toBe(true);
  });

  /** Régression : le nom était coupé à 70 en silence, le pain.008 l'écrit entier (2026-10-23). */
  it("écrit le nom entier jusqu'à 140 caractères, sans le couper à 70", () => {
    const csv = renderMandateBankCsv([{ ...ROW, debtorName: "A".repeat(140) }]);
    expect(csv.split(";")[2]).toBe("A".repeat(140));
  });

  it("refuse un nom au-delà de 140 plutôt que le couper, en nommant le mandat", () => {
    const long = { ...ROW, reference: "RUM-LONG", debtorName: "A".repeat(141) };
    expect(() => renderMandateBankCsv([ROW, long])).toThrow(BankExportDebtorNameTooLongError);
    expect(() => renderMandateBankCsv([ROW, long])).toThrow(/RUM-LONG/u);
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
