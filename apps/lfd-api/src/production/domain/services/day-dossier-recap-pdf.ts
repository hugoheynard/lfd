import type { DayDossier, DossierRecapGroup } from "./day-dossier.js";
import type { MakeRoom } from "./day-dossier-resupplies-pdf.js";
import { methodSplitOf } from "./dossier-addressees.js";
import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  put,
  putCaps,
  putRight,
  rule,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";

/**
 * **Le récapitulatif du dossier, en PDF** — les fiches de poste, une par
 * rayon (R3d-bis du réassort, Hugo 2026-10-21 : « comprendre le volume global
 * par produit »). Chaque produit dit d'abord son TOTAL, commandes + réassorts,
 * en gros ; la part de réassort vient en second, en petit (« dont 18
 * réassort »), jamais à part du total.
 */

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** « dont 18 réassort » — le détail, jamais le chiffre principal. */
function resupplyPart(quantity: number): string {
  return `dont ${String(quantity)} réassort`;
}

/**
 * « N commandes (R en retrait, L en livraison) · M réassorts · P pièces dont
 * Q de réassort » — le lot compté, en une phrase. Une part à zéro ne s'écrit
 * pas : « 3 commandes (3 en retrait) · 12 pièces ».
 */
export function lotCount(dossier: DayDossier): string {
  const pickup = dossier.sheets.filter((order) => order.fulfillmentMethod === "pickup").length;
  const split = methodSplitOf(pickup, dossier.sheets.length - pickup);
  const orders = plural(dossier.sheets.length, "commande");
  const parts = [
    dossier.sheets.length === 0 ? "" : split === "" ? orders : `${orders} (${split})`,
    dossier.resupplySheets.length === 0 ? "" : plural(dossier.resupplySheets.length, "réassort"),
    plural(dossier.pieces, "pièce"),
  ].filter((part) => part !== "");
  const lot = parts.join(" · ");
  return dossier.resupplyPieces === 0
    ? lot
    : `${lot} dont ${String(dossier.resupplyPieces)} de réassort`;
}

/**
 * Une fiche de poste : son total, puis ses produits. Le rayon est le titre
 * de la page (« Viennoiserie — total à produire »), posé par le cadre. Rend le
 * `y` dessous.
 */
export function drawRecapGroup(
  doc: Doc,
  group: DossierRecapGroup,
  top: number,
  room: MakeRoom,
): number {
  let y = top;
  putCaps(
    doc,
    `TOTAL À PRODUIRE · ${plural(group.lines.length, "article").toUpperCase()}`,
    LEFT,
    y,
  );
  y += 5 * MM;
  put(doc, plural(group.quantity, "pièce"), LEFT, y, { size: 22, bold: true });
  if (group.resupplyQuantity > 0) {
    putRight(doc, resupplyPart(group.resupplyQuantity), RIGHT, y + 3 * MM, 11);
  }
  y += 10 * MM;
  rule(doc, y, 1.5);
  y += 4 * MM;
  for (const line of group.lines) {
    y = room(y, (line.resupplyQuantity > 0 ? 15 : 10) * MM);
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 16, bold: true });
    put(doc, line.productName, LEFT + 20 * MM, y, { size: 12, width: WIDTH - 75 * MM });
    putRight(doc, line.sku, RIGHT - 22 * MM, y + 1 * MM, 9);
    // Sur combien de commandes ça se répartit : 240 en 3 fois ne se prépare
    // pas comme 240 en 40.
    if (line.orderCount > 0) {
      putRight(
        doc,
        `${String(line.orderCount)} cde${line.orderCount > 1 ? "s" : ""}`,
        RIGHT,
        y,
        10,
      );
    }
    if (line.resupplyQuantity > 0) {
      y += 5 * MM;
      put(doc, resupplyPart(line.resupplyQuantity), LEFT + 20 * MM, y, { size: 9 });
    }
    y += 6 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y + 4 * MM;
}
