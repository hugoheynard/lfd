import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";
import QRCode from "qrcode-generator";

/**
 * **La trousse des papiers du fournil** — page, polices, traits, QR et rendu
 * déterministe, partagés par la feuille d'atelier, le compte à produire et le
 * dossier du jour.
 *
 * Sortie d'`atelier-sheet-pdf.ts` le 2026-10-06, quand le dossier du jour est
 * venu en troisième : trois papiers du même fournil qui dessineraient chacun
 * leurs marges finiraient par ne plus se ressembler.
 */

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MM = PAGE_WIDTH / 210;
export const MARGIN_X = 12 * MM;
export const MARGIN_Y = 14 * MM;
export const LEFT = MARGIN_X;
export const RIGHT = PAGE_WIDTH - MARGIN_X;
export const WIDTH = RIGHT - LEFT;

export const REGULAR = "Helvetica";
export const BOLD = "Helvetica-Bold";
export const BLACK = "#000000";
export const ROW_GRAY = "#999999";

export type Doc = PDFKit.PDFDocument;

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** `2026-09-08` → « 8 septembre 2026 ». Découpé à la main : `Intl` dépend de l'hôte. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) {
    return iso.slice(0, 10);
  }
  return `${String(Number(day))} ${name} ${year}`;
}

export function put(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  options: { size: number; bold?: boolean; width?: number },
): void {
  doc
    .font(options.bold === true ? BOLD : REGULAR)
    .fontSize(options.size)
    .fillColor(BLACK)
    .text(
      text,
      x,
      y,
      options.width === undefined ? { lineBreak: false } : { width: options.width },
    );
}

export function putRight(
  doc: Doc,
  text: string,
  right: number,
  y: number,
  size: number,
  bold = false,
): void {
  const width = doc
    .font(bold ? BOLD : REGULAR)
    .fontSize(size)
    .widthOfString(text);
  put(doc, text, right - width, y, { size, bold });
}

export function putCaps(doc: Doc, text: string, x: number, y: number): void {
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(BLACK)
    .text(text, x, y, { lineBreak: false, characterSpacing: 0.7 });
}

export function rule(doc: Doc, y: number, thickness: number, color = BLACK): void {
  doc.save().rect(LEFT, y, WIDTH, thickness).fill(color).restore();
  doc.fillColor(BLACK);
}

/**
 * Le QR, dessiné en **carrés pleins** plutôt qu'en image.
 *
 * Une image demanderait un encodeur PNG et ferait entrer des octets binaires
 * dans un document dont on veut garantir la stabilité. Des rectangles sont
 * déterministes par construction, et un lecteur PDF les rend nets à toute
 * échelle — ce qu'une image matricielle ne fait pas.
 */
export function drawQr(doc: Doc, value: string, x: number, y: number, size: number): void {
  const qr = QRCode(0, "M");
  qr.addData(value);
  qr.make();
  const modules = qr.getModuleCount();
  const cell = size / modules;
  doc.save().fillColor(BLACK);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (qr.isDark(row, column)) {
        doc.rect(x + column * cell, y + row * cell, cell, cell).fill();
      }
    }
  }
  doc.restore();
  doc.fillColor(BLACK);
}

/** Les octets d'un document, rendus déterministes par ses dates figées. */
export async function render(at: Date, title: string, draw: (doc: Doc) => void): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: title,
      Author: "La Folie Coffee",
      Producer: "La Folie Coffee",
      Creator: "La Folie Coffee",
      CreationDate: at,
      ModDate: at,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => {
      resolve();
    });
  });
  draw(doc);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/** « Retrait » / « Livraison », en un mot — le fournil charge, il ne facture pas. */
export function methodLabel(method: "pickup" | "delivery"): string {
  return method === "pickup" ? "Retrait" : "Livraison";
}
