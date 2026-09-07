import { renderTextPdf } from "../pdf-writer.js";

/**
 * Un générateur de PDF ne se relit pas : on le PROUVE. Ces cas ouvrent les
 * octets produits et vérifient la structure — en-tête, table de références, fin
 * de fichier — puis la seule propriété dont dépend le rangement en R2 : **les
 * mêmes entrées rendent les mêmes octets**.
 */

const LINES = [
  { text: "BON DE COMMANDE", bold: true, size: 16 },
  { text: "Commande : ORD-4812" },
  { text: "  12 × Tradition        14,40 €", mono: true },
  { text: "  Total TTC             21,65 €", mono: true, bold: true },
];

describe("le générateur de PDF", () => {
  it("commence par l'en-tête de format et finit par la marque de fin", () => {
    const pdf = renderTextPdf(LINES).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("porte une table de références, et son décalage tombe dessus", () => {
    // Un `startxref` faux rend un fichier que certains lecteurs ouvrent et que
    // d'autres refusent — la pire des deux pannes.
    const pdf = renderTextPdf(LINES).toString("latin1");
    const declared = Number(/startxref\n(\d+)/u.exec(pdf)?.[1] ?? "-1");

    expect(pdf.slice(declared, declared + 4)).toBe("xref");
  });

  it("n'écrit NI date de création NI identifiant de document", () => {
    // Les deux rendraient le fichier différent à chaque rendu, sans que rien ne
    // paraisse faux — et l'écriture au premier téléchargement cesserait d'être
    // idempotente.
    const pdf = renderTextPdf(LINES).toString("latin1");

    expect(pdf).not.toContain("/CreationDate");
    expect(pdf).not.toContain("/Info");
  });

  it("rend les MÊMES octets deux fois", () => {
    expect(renderTextPdf(LINES)).toEqual(renderTextPdf(LINES));
  });

  it("déclare les quatre polices standard, sans en embarquer aucune", () => {
    const pdf = renderTextPdf(LINES).toString("latin1");

    for (const font of ["/Helvetica", "/Helvetica-Bold", "/Courier", "/Courier-Bold"]) {
      expect(pdf).toContain(font);
    }
    // Une police embarquée porterait un flux de fichier ; les quatorze standard
    // n'ont pas à l'être, et tout lecteur les possède.
    expect(pdf).not.toContain("/FontFile");
  });

  it("déclare WinAnsi — sans quoi les accents partiraient de travers", () => {
    expect(renderTextPdf([{ text: "Éclair à Val d'Isère" }]).toString("latin1")).toContain(
      "/WinAnsiEncoding",
    );
  });

  it("échappe les parenthèses, qui fermeraient la chaîne au mauvais endroit", () => {
    // Pas « mal rendu » : illisible. Un `(` nu casse la structure du fichier.
    const pdf = renderTextPdf([{ text: "Note : (sonner) au 2e" }]).toString("latin1");

    expect(pdf).toContain("\\(sonner\\)");
  });

  it("pagine au-delà d'une page, plutôt que d'écrire hors de la feuille", () => {
    const many = Array.from({ length: 120 }, (_unused, index) => ({
      text: `ligne ${String(index)}`,
    }));

    expect(renderTextPdf(many).toString("latin1")).toContain("/Count 3");
  });

  it("rend une page vide plutôt qu'un document sans page", () => {
    // Un PDF à zéro page est refusé par la plupart des lecteurs : mieux vaut une
    // feuille blanche, qui dit au moins que le document a été produit.
    expect(renderTextPdf([]).toString("latin1")).toContain("/Count 1");
  });
});
