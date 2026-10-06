import { Buffer } from "node:buffer";

import type { ProducedItemSnapshot, ProductionOrderSnapshot } from "../entities/production-day.js";
import {
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  drawQr,
  longDate,
  parisDate,
  methodLabel,
  put,
  putCaps,
  putRight,
  render,
  rule,
} from "./paper-pdf-kit.js";

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

    put(doc, `Journée arrêtée le ${parisDate(closedAt)}`, LEFT, PAGE_HEIGHT - MARGIN_Y, {
      size: 9,
    });
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
      `Arrêté le ${parisDate(closedAt)} — il ne se recalcule pas.`,
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
