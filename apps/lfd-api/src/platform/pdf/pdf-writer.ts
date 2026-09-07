import { Buffer } from "node:buffer";

/**
 * Un **générateur de PDF minimal** : des lignes de texte → les octets d'un PDF
 * A4 valide.
 *
 * ## Pourquoi l'écrire plutôt que l'installer
 *
 * Le critère qui décide n'est pas la taille de la dépendance, c'est le
 * **déterminisme**. Le bon de commande remis au client est écrit une fois et
 * rangé ; deux rendus de la même révision doivent produire les **mêmes octets**,
 * sans quoi l'écriture au premier téléchargement cesse d'être idempotente et
 * deux onglets simultanés peuvent laisser en magasin un fichier différent de
 * celui qui a été servi.
 *
 * Or les bibliothèques de PDF écrivent, par défaut et souvent sans option, une
 * `/CreationDate` et un identifiant de document `/ID` tirés au sort. Rien ne
 * paraît faux à l'écran ; les octets diffèrent à chaque appel. Un générateur qui
 * n'écrit **ni l'un ni l'autre** garantit ce qu'une configuration ne fait
 * qu'espérer.
 *
 * ## Ce qu'il sait faire, et c'est tout ce qu'il faut ici
 *
 * Du texte, sur des pages A4, avec pagination : Helvetica normale ou grasse pour
 * la prose, **Courier** pour tout ce qui s'aligne en colonnes. Les quatorze
 * polices standard du format n'ont pas à être embarquées : tout lecteur PDF les
 * possède. Aucune image — le bon de commande n'en porte pas, et
 * **surtout pas le QR**, qui est un secret et dont ce fichier est archivé pour
 * toujours.
 */

/** A4 en points PostScript (72 dpi) : 210 × 297 mm. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** Marges en points. 42 pt ≈ 15 mm — de quoi imprimer sans rogner. */
const MARGIN = 42;

/** Interligne. À 10 pt de corps, 14 pt donne un texte qu'on lit en diagonale. */
const LEADING = 14;

/** Le nombre de lignes qu'une page accueille, marges comprises. */
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEADING);

/** Une ligne à poser : son texte, et comment. */
export interface PdfLine {
  readonly text: string;
  readonly bold?: boolean;
  /**
   * Chasse **fixe** (Courier). Indispensable dès qu'une ligne porte des
   * colonnes : Helvetica est proportionnelle, et des montants cadrés à l'espace
   * y arrivent en escalier. Un tableau de prix qui ne s'aligne pas se relit deux
   * fois — et sur une facture, se relire deux fois est déjà un doute.
   */
  readonly mono?: boolean;
  /** Corps en points. 10 par défaut ; le titre monte. */
  readonly size?: number;
}

/**
 * Échappe une chaîne pour une **chaîne littérale PDF**.
 *
 * Trois caractères seulement ont un sens dans ce contexte : la barre oblique
 * inverse et les deux parenthèses. Un `(` non échappé fermerait la chaîne au
 * mauvais endroit et rendrait le fichier illisible — pas mal rendu, illisible.
 */
function escapeText(value: string): string {
  return value.replace(/[\\()]/gu, (char) => `\\${char}`);
}

/**
 * Encode en **WinAnsi** — l'encodage que les pages déclarent.
 *
 * Latin-1 couvre les accents français et italiens ; les quelques caractères que
 * la maison emploie et qui n'y sont pas (l'apostrophe courbe, le tiret cadratin,
 * l'euro, le signe moins) sont traduits à leur position WinAnsi. Un caractère
 * inconnu devient un point d'interrogation : un octet hors table produirait un
 * glyphe au hasard, et une ligne de commande illisible vaut mieux qu'une ligne
 * de commande fausse.
 */
const WIN_ANSI_SPECIALS: Readonly<Record<string, number>> = {
  "€": 0x80, // €
  "‘": 0x91, // '
  "’": 0x92, // '
  "“": 0x93, // "
  "”": 0x94, // "
  "•": 0x95, // •
  "–": 0x96, // –
  "—": 0x97, // —
  "−": 0x2d, // − (signe moins mathématique → trait d'union)
  "×": 0xd7, // ×
  "·": 0xb7, // ·
};

function toWinAnsi(value: string): Buffer {
  const bytes = [...value].map((char) => {
    const special = WIN_ANSI_SPECIALS[char];
    if (special !== undefined) {
      return special;
    }
    const code = char.codePointAt(0) ?? 0x3f;
    return code <= 0xff ? code : 0x3f;
  });
  return Buffer.from(bytes);
}

/** Courier, grasse ou non — la chasse fixe n'interdit pas d'appuyer un total. */
function monoFont(line: PdfLine): string {
  return line.bold === true ? "/F4" : "/F3";
}

/** Le flux de contenu d'une page : une opération de texte par ligne. */
function contentStream(lines: readonly PdfLine[]): Buffer {
  const parts = lines.map((line, index) => {
    const size = line.size ?? 10;
    // Quatre polices et non trois : `mono` et `bold` se combinent. Une ligne de
    // total est **en colonnes ET en gras** — la première version faisait gagner
    // `mono`, et le total du document se rendait en maigre, exactement là où on
    // le cherche.
    const font = line.mono === true ? monoFont(line) : line.bold === true ? "/F2" : "/F1";
    const y = PAGE_HEIGHT - MARGIN - (index + 1) * LEADING;
    return Buffer.concat([
      Buffer.from(`BT ${font} ${String(size)} Tf 1 0 0 1 ${String(MARGIN)} ${String(y)} Tm (`),
      toWinAnsi(escapeText(line.text)),
      Buffer.from(") Tj ET\n"),
    ]);
  });
  return Buffer.concat(parts);
}

/** Découpe les lignes en pages. Une page vide vaut mieux qu'un document vide. */
function paginate(lines: readonly PdfLine[]): readonly (readonly PdfLine[])[] {
  if (lines.length === 0) {
    return [[]];
  }
  const pages: PdfLine[][] = [];
  for (let at = 0; at < lines.length; at += LINES_PER_PAGE) {
    pages.push([...lines.slice(at, at + LINES_PER_PAGE)]);
  }
  return pages;
}

/**
 * Rend un PDF A4 à partir de lignes de texte.
 *
 * **Déterministe** : aucune date, aucun identifiant de document, aucun aléa.
 * Deux appels sur les mêmes lignes rendent les mêmes octets — c'est ce sur quoi
 * repose l'écriture au premier téléchargement.
 */
export function renderTextPdf(lines: readonly PdfLine[]): Buffer {
  const pages = paginate(lines);

  // Les objets, dans l'ordre où le fichier les portera. Catalogue et arbre de
  // pages d'abord, puis deux objets par page (la page, son contenu), puis les
  // deux polices. L'ordre n'est pas libre : la table xref donne des OFFSETS,
  // donc chaque objet doit être écrit là où elle le dit.
  const firstPageId = 3;
  const fontRegularId = firstPageId + pages.length * 2;
  const fontBoldId = fontRegularId + 1;
  const fontMonoId = fontBoldId + 1;
  const fontMonoBoldId = fontMonoId + 1;

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(
      `<< /Type /Pages /Kids [${pages
        .map((_page, index) => `${String(firstPageId + index * 2)} 0 R`)
        .join(" ")}] /Count ${String(pages.length)} >>`,
    ),
  ];

  for (const [index, page] of pages.entries()) {
    const contentId = firstPageId + index * 2 + 1;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] ` +
          `/Resources << /Font << /F1 ${String(fontRegularId)} 0 R /F2 ${String(fontBoldId)} 0 R ` +
          `/F3 ${String(fontMonoId)} 0 R /F4 ${String(fontMonoBoldId)} 0 R >> >> ` +
          `/Contents ${String(contentId)} 0 R >>`,
      ),
    );
    const stream = contentStream(page);
    objects.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${String(stream.length)} >>\nstream\n`),
        stream,
        Buffer.from("endstream"),
      ]),
    );
  }

  // `/Encoding /WinAnsiEncoding` : sans lui, les accents partiraient dans
  // l'encodage standard du format, où « é » n'existe pas.
  objects.push(
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
    ),
  );

  const head = Buffer.from("%PDF-1.4\n");
  const chunks: Buffer[] = [head];
  const offsets: number[] = [];
  let cursor = head.length;

  for (const [index, body] of objects.entries()) {
    offsets.push(cursor);
    const object = Buffer.concat([
      Buffer.from(`${String(index + 1)} 0 obj\n`),
      body,
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(object);
    cursor += object.length;
  }

  // La table de références croisées. Ses entrées font EXACTEMENT vingt octets
  // — c'est la norme, et un lecteur strict refuse le fichier autrement.
  const xrefAt = cursor;
  const xref = [
    `xref\n0 ${String(objects.length + 1)}\n`,
    "0000000000 65535 f \n",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
  ].join("");

  // PAS de `/Info` : ce dictionnaire porterait une `/CreationDate`. PAS d'`/ID`
  // non plus. Les deux rendraient le fichier différent à chaque rendu, sans que
  // rien ne paraisse faux — et l'idempotence du rangement en dépend.
  const trailer =
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(xrefAt)}\n%%EOF\n`;

  return Buffer.concat([...chunks, Buffer.from(xref), Buffer.from(trailer)]);
}
