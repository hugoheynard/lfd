import type { ProductionResupplySnapshot } from "../entities/production-day.js";
import { resupplySheetTitleOf } from "./day-dossier.js";
import { drawOrderSwatch } from "./order-color-swatch.js";
import {
  LEFT,
  MARGIN_Y,
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

/** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
export type MakeRoom = (y: number, needed: number) => number;

/**
 * **Le bon de réassort** (R3d-bis du réassort, Hugo 2026-10-21) — une page
 * par réassort, à la suite des bons de commande : le point, ses lignes, ses
 * quantités. Sans prix, et sans QR : un réassort n'a pas de client, et la
 * fiche du Village se tient au colisage.
 *
 * Il remplace la section « Réassorts » que R3d posait sous le récapitulatif :
 * les quantités sont désormais DANS le total des fiches de poste, et le bon
 * dit la répartition par point — la section aurait dit deux fois la même
 * chose.
 *
 * `banner` est le bandeau du lot (« LOT POUR LE MER. 7 OCT. ») ; `rank`,
 * « réassort 1/2 ». `color` est la teinte de réassort du site destinataire
 * (Hugo, 2026-10-22) : une pastille devant le titre, du même dessin que celle
 * des commandes, sans mot ; `null` — site sans teinte — n'en pose aucune.
 * Rend le `y` sous la dernière ligne.
 */
export function drawResupplySheet(
  doc: Doc,
  resupply: ProductionResupplySnapshot,
  banner: string,
  rank: string,
  room: MakeRoom,
  color: string | null,
): number {
  let y = MARGIN_Y;
  putCaps(doc, `${banner} · ${rank.toUpperCase()}`, LEFT, y);
  y += 5 * MM;
  const swatch = drawOrderSwatch(doc, color, LEFT, y + 0.5 * MM);
  put(doc, resupplySheetTitleOf(resupply), LEFT + swatch, y, {
    size: 16,
    bold: true,
    width: WIDTH - 40 * MM - swatch,
  });
  putRight(doc, "RÉASSORT", RIGHT, y + 1, 12, true);
  y += 8 * MM;
  put(doc, resupply.servedByTransfer ? "Par transfert" : "Servi sur place", LEFT, y, { size: 11 });
  y += 5.5 * MM;
  rule(doc, y, 2);
  const pieces = resupply.lines.reduce((sum, line) => sum + line.quantity, 0);
  y += 5 * MM;
  putCaps(doc, `À PRÉPARER — ${String(pieces)} pièce${pieces > 1 ? "s" : ""}`, LEFT, y);
  putCaps(doc, "FAIT", RIGHT - 8 * MM, y);
  y += 6 * MM;
  for (const line of resupply.lines) {
    y = room(y, 10 * MM);
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 18, bold: true });
    put(doc, line.productName, LEFT + 18 * MM, y, { size: 13, width: WIDTH - 70 * MM });
    putRight(doc, line.sku, RIGHT - 14 * MM, y + 1 * MM, 9);
    doc
      .save()
      .lineWidth(0.8)
      .rect(RIGHT - 6 * MM, y - 0.5 * MM, 5 * MM, 5 * MM)
      .stroke()
      .restore();
    y += 6.4 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y;
}
