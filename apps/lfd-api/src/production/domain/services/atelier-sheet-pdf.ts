import { Buffer } from "node:buffer";

import type { ProducedItemSnapshot, ProductionOrderSnapshot } from "../entities/production-day.js";
import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  longDate,
  parisDate,
  put,
  putCaps,
  putRight,
  render,
  rule,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { drawCountPie } from "./count-color-pie.js";
import type { CountColorShare } from "./count-color-shares.js";
import { drawRouting } from "./order-routing-pdf.js";
import { PaperPages } from "../../../platform/pdf/paper-pages.js";

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
 * comptoir encode un **secret** (le jeton de retrait), celui de l'atelier encode
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

/**
 * **La feuille d'une commande.** Ce qu'on prépare, pour qui, et où ça va.
 *
 * `colisageUrl` est vide quand l'origine du back-office n'est pas configurée :
 * on n'imprime alors AUCUN code, plutôt qu'un carré qui ne mènerait nulle part
 * une fois scanné devant un four.
 *
 * `color` est la pastille de la commande (§0 bis du plan de la planche des
 * documents v2, 2026-10-22), devant son acheminement depuis le 2026-10-25
 * (« Retrait Village · pro ») — `null` : aucune pastille.
 *
 * Titrée « ORD-0001 // Fiche de préparation » dans l'en-tête au logo de chaque
 * page, comme le dossier du jour (Hugo, 2026-10-25) ; une fiche qui déborde
 * porte « (1/2) », « (2/2) ».
 */
export function renderAtelierSheetPdf(
  order: ProductionOrderSnapshot,
  sheet: { readonly serviceDay: string; readonly closedAt: Date; readonly logo: Buffer },
  colisageUrl: string,
  color: string | null,
): Promise<Buffer> {
  return render(
    sheet.closedAt,
    `Fiche d'atelier ${order.reference}`,
    (doc) => {
      const pages = new PaperPages(doc);
      let y = pages.open(`${order.reference} // Fiche de préparation`);
      drawRouting(doc, order, color, { right: RIGHT, y, size: 12 });
      put(doc, order.reference, LEFT, y, { size: 13, bold: true });
      y += 7 * MM;
      y = drawParties(doc, order, y);
      y = drawLines(doc, order, y, (at, needed) => pages.room(at, needed));
      if (colisageUrl !== "") {
        drawScan(doc, colisageUrl, order.reference, pages.room(y + 4 * MM, SCAN + 4 * MM));
      }
      pages.finish({
        logo: sheet.logo,
        headerRight: longDate(sheet.serviceDay),
        footerLeft: `Journée arrêtée le ${parisDate(sheet.closedAt)}`,
      });
    },
    true,
  );
}

const SCAN = 30 * MM;

/** Pour qui, et où ça va ; rend le `y` sous le trait. */
function drawParties(doc: Doc, order: ProductionOrderSnapshot, top: number): number {
  let y = top;
  rule(doc, y, 2);
  y += 5 * MM;
  putCaps(doc, "CLIENT", LEFT, y);
  const half = LEFT + WIDTH / 2;
  putCaps(doc, "DESTINATION", half, y);
  y += 5 * MM;
  put(doc, order.customerLabel, LEFT, y, { size: 14, bold: true, width: half - LEFT - 6 * MM });
  put(doc, order.destination, half, y, { size: 12, width: RIGHT - half });
  // Une adresse longue passe sur deux lignes : le trait descend avec elle.
  const tall = doc.fontSize(12).heightOfString(order.destination, { width: RIGHT - half });
  y += Math.max(8 * MM, tall + 3 * MM);
  rule(doc, y, 1);
  return y;
}

/** Les lignes à préparer ; rend le `y` sous la dernière. */
function drawLines(
  doc: Doc,
  order: ProductionOrderSnapshot,
  top: number,
  room: (at: number, needed: number) => number,
): number {
  const pieces = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  let y = top + 5 * MM;
  putCaps(doc, `À PRÉPARER — ${String(pieces)} pièces`, LEFT, y);
  y += 6 * MM;
  for (const line of order.lines) {
    y = room(y, 10 * MM);
    // La quantité en GROS, à gauche : c'est le seul chiffre qu'on lit à un
    // mètre, les mains prises. Le nom suit, le SKU ferme la ligne.
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 18, bold: true });
    put(doc, line.productName, LEFT + 18 * MM, y, { size: 13, width: WIDTH - 60 * MM });
    putRight(doc, line.sku, RIGHT, y + 1 * MM, 9);
    y += 6.4 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y;
}

/** Le QR de colisage. */
function drawScan(doc: Doc, url: string, reference: string, y: number): void {
  drawQr(doc, url, LEFT, y, SCAN);
  put(doc, "Scanner pour signaler", LEFT + SCAN + 6 * MM, y + 8 * MM, { size: 12, bold: true });
  put(doc, "que la commande est prête.", LEFT + SCAN + 6 * MM, y + 13 * MM, { size: 12 });
  // ⚠️ Ce code encode un NOM, pas un secret : la référence est déjà écrite
  // en toutes lettres au-dessus. C'est ce qui l'autorise sur un papier.
  put(doc, reference, LEFT + SCAN + 6 * MM, y + 20 * MM, { size: 10 });
}

/**
 * **Le compte à produire d'une journée** — combien de chaque article, tous
 * clients confondus.
 *
 * ⚠️ **Aucun nom de client n'y figure.** C'est un compte de matière, pas une
 * liste de commandes : le fournil s'en sert pour lancer des fournées, pas pour
 * préparer des sacs. La feuille par commande, elle, nomme le client — les deux
 * ne se remplacent pas.
 *
 * `shares` est la répartition du jour entre les couleurs de destination : UN
 * camembert en haut, à droite du total (Hugo, 2026-10-22), sans un mot. Vide :
 * aucun camembert.
 */
export function renderProductionCountPdf(
  items: readonly ProducedItemSnapshot[],
  sheet: { readonly serviceDay: string; readonly closedAt: Date; readonly logo: Buffer },
  shares: readonly CountColorShare[],
): Promise<Buffer> {
  return render(
    sheet.closedAt,
    `Compte à produire ${sheet.serviceDay}`,
    (doc) => {
      const pages = new PaperPages(doc);
      let y = pages.open("Compte à produire");
      const total = items.reduce((sum, item) => sum + item.quantity, 0);
      putCaps(doc, `${String(items.length)} articles, ${String(total)} pièces`, LEFT, y);
      if (shares.length > 0) {
        drawCountPie(doc, shares, { x: RIGHT - PIE, y: y + PIE - 1 * MM }, PIE);
        y += 2 * PIE - 2 * MM;
      }
      y += 7 * MM;
      for (const item of items) {
        y = pages.room(y, 11 * MM);
        put(doc, String(item.quantity), LEFT, y - 1.5 * MM, { size: 20, bold: true });
        put(doc, item.productName, LEFT + 22 * MM, y, { size: 14, width: WIDTH - 64 * MM });
        putRight(doc, item.sku, RIGHT, y + 1.5 * MM, 9);
        y += 7 * MM;
        rule(doc, y, 0.6, ROW_GRAY);
        y += 3.5 * MM;
      }
      pages.finish({
        logo: sheet.logo,
        headerRight: longDate(sheet.serviceDay),
        footerLeft: `Arrêté le ${parisDate(sheet.closedAt)} — il ne se recalcule pas.`,
      });
    },
    true,
  );
}

/**
 * `v2` (2026-10-25, Hugo) : en-tête au logo, « ORD-… // Fiche de
 * préparation », acheminement « Retrait <site> · pro » derrière la pastille,
 * numéro de page encadré. Sans version avant elle.
 */
export const ATELIER_LAYOUT_VERSION = "v2";

/**
 * `v2` (2026-10-25, Hugo) : le compte à produire prend le cadre des papiers
 * du fournil (en-tête au logo, numéro de page encadré, « (1/x) »). Un compte
 * archivé sous l'ancienne clé n'est jamais resservi.
 */
export const COUNT_LAYOUT_VERSION = "v2";

/** Le rayon du camembert du jour. */
const PIE = 6 * MM;

/** La clé du compte à produire. Une par journée et par mise en page. */
export function productionCountPdfKey(serviceDay: string): string {
  return `${serviceDay}/compte-a-produire-${COUNT_LAYOUT_VERSION}.pdf`;
}

/**
 * La clé d'une feuille d'atelier.
 *
 * Le préfixe `orders/{orderId}/` est le MÊME que dans le bucket des pièces
 * client, et c'est voulu : les papiers d'une commande se retrouvent sous son
 * identifiant, où qu'ils vivent. Ce qui les sépare est le bucket — donc la
 * durée de vie et le jeton —, pas le chemin.
 *
 * La version de mise en page entre dans le nom, comme pour le dossier du jour :
 * une fiche archivée sous l'ancien papier n'est jamais resservie.
 */
export function atelierSheetPdfKey(orderId: string): string {
  return `orders/${orderId}/fiche-atelier-${ATELIER_LAYOUT_VERSION}.pdf`;
}
