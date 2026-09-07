import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";
import QRCode from "qrcode-generator";

import type { ProducedItemSnapshot, ProductionOrderSnapshot } from "../entities/production-day.js";

/**
 * **Les papiers du fournil** — la feuille d'une commande, et le compte du jour.
 *
 * ## Ce qu'ils ne portent PAS, et pourquoi c'est structurel
 *
 * **Aucun montant.** Le fournil fabrique, il ne facture pas. Ce n'est pas une
 * consigne appliquée au rendu : `ProductionOrderSnapshot` n'a pas de champ de
 * prix, donc il n'y a rien à laisser vide et rien à remplir par distraction.
 *
 * ## Le QR, lui, s'imprime — et c'est l'inverse du bon de commande
 *
 * 🔴 Les deux codes n'ont pas la même nature, et c'est toute la règle : celui du
 * comptoir encode un **secret** (le jeton de remise), celui de l'atelier encode
 * un **nom** (`/colisage/{référence}`). Un secret sur un papier qui voyage dans
 * un carton se ferait scanner par le coursier ; une référence, non — elle est
 * déjà écrite en toutes lettres au-dessus.
 *
 * Scanner ce code ouvre l'écran qui déclare la commande prête. C'est le geste
 * que l'atelier faisait au stylo.
 *
 * ## Déterminisme
 *
 * Mêmes entrées, mêmes octets : les dates viennent de la journée et de la
 * clôture, jamais de l'horloge, et `Producer`/`Creator` sont posés en dur pour
 * qu'une montée de `pdfkit` ne change pas un document déjà archivé.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MM = PAGE_WIDTH / 210;
const MARGIN_X = 12 * MM;
const MARGIN_Y = 14 * MM;
const LEFT = MARGIN_X;
const RIGHT = PAGE_WIDTH - MARGIN_X;
const WIDTH = RIGHT - LEFT;

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const BLACK = "#000000";
const ROW_GRAY = "#999999";

type Doc = PDFKit.PDFDocument;

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
function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) {
    return iso.slice(0, 10);
  }
  return `${String(Number(day))} ${name} ${year}`;
}

function put(
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

function putRight(
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

function putCaps(doc: Doc, text: string, x: number, y: number): void {
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(BLACK)
    .text(text, x, y, { lineBreak: false, characterSpacing: 0.7 });
}

function rule(doc: Doc, y: number, thickness: number, color = BLACK): void {
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
function drawQr(doc: Doc, value: string, x: number, y: number, size: number): void {
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
async function render(at: Date, title: string, draw: (doc: Doc) => void): Promise<Buffer> {
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
function methodLabel(method: "pickup" | "delivery"): string {
  return method === "pickup" ? "Retrait" : "Livraison";
}

/**
 * **La feuille d'une commande.** Ce qu'on prépare, pour qui, et où ça va.
 *
 * `colisageUrl` est vide quand l'origine du back-office n'est pas configurée :
 * on n'imprime alors AUCUN code, plutôt qu'un carré qui ne mènerait nulle part
 * une fois scanné devant un four.
 */
export function renderAtelierSheetPdf(
  order: ProductionOrderSnapshot,
  serviceDay: string,
  closedAt: Date,
  colisageUrl: string,
): Promise<Buffer> {
  return render(closedAt, `Fiche d'atelier ${order.reference}`, (doc) => {
    let y = MARGIN_Y;
    put(doc, "FICHE D'ATELIER", LEFT, y, { size: 16, bold: true });
    putRight(doc, longDate(serviceDay), RIGHT, y + 3, 12, true);
    y += 5.5 * MM;
    put(doc, order.reference, LEFT, y, { size: 13, bold: true });
    putRight(doc, methodLabel(order.fulfillmentMethod), RIGHT, y, 11);
    y += 5 * MM;
    rule(doc, y, 2);

    y += 5 * MM;
    putCaps(doc, "CLIENT", LEFT, y);
    const half = LEFT + WIDTH / 2;
    putCaps(doc, "DESTINATION", half, y);
    y += 5 * MM;
    put(doc, order.customerLabel, LEFT, y, { size: 14, bold: true, width: half - LEFT - 6 * MM });
    put(doc, order.destination, half, y, { size: 12, width: RIGHT - half });
    y += 8 * MM;
    rule(doc, y, 1);

    const pieces = order.lines.reduce((sum, line) => sum + line.quantity, 0);
    y += 5 * MM;
    putCaps(doc, `À PRÉPARER — ${String(pieces)} pièces`, LEFT, y);
    y += 6 * MM;

    for (const line of order.lines) {
      // La quantité en GROS, à gauche : c'est le seul chiffre qu'on lit à un
      // mètre, les mains prises. Le nom suit, le SKU ferme la ligne.
      put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 18, bold: true });
      put(doc, line.productName, LEFT + 18 * MM, y, { size: 13, width: WIDTH - 60 * MM });
      putRight(doc, line.sku, RIGHT, y + 1 * MM, 9);
      y += 6.4 * MM;
      rule(doc, y, 0.6, ROW_GRAY);
      y += 3 * MM;
    }

    if (colisageUrl !== "") {
      y += 4 * MM;
      const size = 30 * MM;
      drawQr(doc, colisageUrl, LEFT, y, size);
      put(doc, "Scanner pour signaler", LEFT + size + 6 * MM, y + 8 * MM, { size: 12, bold: true });
      put(doc, "que la commande est prête.", LEFT + size + 6 * MM, y + 13 * MM, { size: 12 });
      // ⚠️ Ce code encode un NOM, pas un secret : la référence est déjà écrite
      // en toutes lettres au-dessus. C'est ce qui l'autorise sur un papier.
      put(doc, order.reference, LEFT + size + 6 * MM, y + 20 * MM, { size: 10 });
    }

    put(
      doc,
      `Journée arrêtée le ${longDate(closedAt.toISOString())}`,
      LEFT,
      PAGE_HEIGHT - MARGIN_Y,
      {
        size: 9,
      },
    );
    putRight(doc, "La Folie Coffee — fournil", RIGHT, PAGE_HEIGHT - MARGIN_Y, 9);
  });
}

/**
 * **Le compte à produire d'une journée** — combien de chaque article, tous
 * clients confondus.
 *
 * ⚠️ **Aucun nom de client n'y figure.** C'est un compte de matière, pas une
 * liste de commandes : le fournil s'en sert pour lancer des fournées, pas pour
 * préparer des sacs. La feuille par commande, elle, nomme le client — les deux
 * ne se remplacent pas.
 */
export function renderProductionCountPdf(
  items: readonly ProducedItemSnapshot[],
  serviceDay: string,
  closedAt: Date,
): Promise<Buffer> {
  return render(closedAt, `Compte à produire ${serviceDay}`, (doc) => {
    let y = MARGIN_Y;
    put(doc, "COMPTE À PRODUIRE", LEFT, y, { size: 16, bold: true });
    putRight(doc, longDate(serviceDay), RIGHT, y + 3, 12, true);
    y += 6 * MM;
    rule(doc, y, 2);

    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    y += 5 * MM;
    putCaps(doc, `${String(items.length)} articles, ${String(total)} pièces`, LEFT, y);
    y += 7 * MM;

    for (const item of items) {
      put(doc, String(item.quantity), LEFT, y - 1.5 * MM, { size: 20, bold: true });
      put(doc, item.productName, LEFT + 22 * MM, y, { size: 14, width: WIDTH - 64 * MM });
      putRight(doc, item.sku, RIGHT, y + 1.5 * MM, 9);
      y += 7 * MM;
      rule(doc, y, 0.6, ROW_GRAY);
      y += 3.5 * MM;
    }

    put(
      doc,
      `Arrêté le ${longDate(closedAt.toISOString())} — il ne se recalcule pas.`,
      LEFT,
      PAGE_HEIGHT - MARGIN_Y,
      {
        size: 9,
      },
    );
    putRight(doc, "La Folie Coffee — fournil", RIGHT, PAGE_HEIGHT - MARGIN_Y, 9);
  });
}

/** La clé du compte à produire. Une par journée : il n'y en a jamais deux. */
export function productionCountPdfKey(serviceDay: string): string {
  return `${serviceDay}/compte-a-produire.pdf`;
}

/**
 * La clé d'une feuille d'atelier.
 *
 * Le préfixe `orders/{orderId}/` est le MÊME que dans le bucket des pièces
 * client, et c'est voulu : les papiers d'une commande se retrouvent sous son
 * identifiant, où qu'ils vivent. Ce qui les sépare est le bucket — donc la
 * durée de vie et le jeton —, pas le chemin.
 */
export function atelierSheetPdfKey(orderId: string): string {
  return `orders/${orderId}/fiche-atelier.pdf`;
}
