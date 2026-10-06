import { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";
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

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

/** Le décalage de chaque mois pour l'algorithme de Sakamoto (0 = dimanche). */
const SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

/**
 * Le jour de la semaine d'un JOUR calendaire, sans `Date` : un jour n'a pas de
 * fuseau, et l'arithmétique ne dépend ni de l'hôte ni de l'horloge.
 */
function weekdayOf(year: number, month: number, day: number): string | undefined {
  const y = month < 3 ? year - 1 : year;
  const offset = SAKAMOTO[month - 1];
  if (offset === undefined) {
    return undefined;
  }
  const index =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offset + day) % 7;
  return WEEKDAYS[index];
}

/** `2026-10-07` → « mercredi 7 octobre 2026 » — le jour se lit avant la date. */
export function weekdayLongDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const weekday =
    year === undefined || month === undefined || day === undefined
      ? undefined
      : weekdayOf(year, month, day);
  return weekday === undefined ? longDate(iso) : `${weekday} ${longDate(iso)}`;
}

const SHORT_MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** `2026-10-07` → « mer. 7 oct. » — pour un bandeau en capitales. */
export function weekdayShortDate(iso: string): string {
  const [weekday, day] = weekdayLongDate(iso).split(" ");
  const month = SHORT_MONTHS[Number(iso.slice(5, 7)) - 1];
  if (weekday === undefined || day === undefined || month === undefined) {
    return iso.slice(0, 10);
  }
  return `${weekday.slice(0, 3)}. ${day} ${month}`;
}

/**
 * Un INSTANT → « 6 octobre 2026 », **à l'heure de Paris**.
 *
 * Régression (2026-10-06) : les pieds « Arrêté le … » passaient
 * `closedAt.toISOString()` à `longDate`, c'est-à-dire le jour UTC — une
 * clôture faite après 22 h (été) ou 23 h (hiver) heure de Paris imprimait la
 * veille. `longDate` ne prend qu'un JOUR ; un instant passe par ici.
 */
export function parisDate(instant: Date): string {
  return weekdayLongDate(instantToLocal(instant).day);
}

/** Un instant → « 6 octobre 2026 à 23:15 », à l'heure de Paris. */
export function parisDateTime(instant: Date): string {
  const local = instantToLocal(instant);
  return `${weekdayLongDate(local.day)} à ${local.time}`;
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
export async function render(
  at: Date,
  title: string,
  draw: (doc: Doc) => void,
  bufferPages = false,
): Promise<Buffer> {
  const doc = new PDFDocument({
    // `bufferPages` garde les pages ouvertes jusqu'à la fin, pour qu'un pied
    // puisse dire « 3/12 » une fois le total connu.
    bufferPages,
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
