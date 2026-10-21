import type { DayDossier, DossierResupplyPoint } from "./day-dossier.js";
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

/** Tourne la page s'il ne reste pas `needed` sous `y` ; rend le `y` où écrire. */
export type MakeRoom = (y: number, needed: number) => number;

/**
 * **La section « Réassorts » du dossier** (lot R3d du réassort) — sous le
 * récapitulatif des commandes, un bloc par point, une ligne par produit.
 * Ni bon ni QR : un réassort n'a pas de client, et la fiche du Village se
 * tient au colisage. Rien n'est écrit quand la journée n'en a pas.
 *
 * Rend le `y` sous la section.
 */
export function drawResupplies(doc: Doc, dossier: DayDossier, top: number, room: MakeRoom): number {
  if (dossier.resupplies.length === 0) {
    return top;
  }
  let y = room(top, 24 * MM);
  const points = dossier.resupplies.length;
  putCaps(
    doc,
    `RÉASSORTS — ${String(dossier.resupplyPieces)} pièce${dossier.resupplyPieces > 1 ? "s" : ""} pour ${String(points)} point${points > 1 ? "s" : ""}`,
    LEFT,
    y,
  );
  y += 8 * MM;
  for (const point of dossier.resupplies) {
    y = drawPoint(doc, point, y, room);
  }
  return y;
}

function drawPoint(doc: Doc, point: DossierResupplyPoint, top: number, room: MakeRoom): number {
  let y = room(top, 16 * MM);
  put(doc, `RÉASSORT ${point.label.toUpperCase()}`, LEFT, y, { size: 11, bold: true });
  putRight(doc, String(point.quantity), RIGHT, y, 11, true);
  y += 5 * MM;
  rule(doc, y, 1);
  y += 3.5 * MM;
  for (const line of point.lines) {
    y = room(y, 10 * MM);
    put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 16, bold: true });
    put(doc, line.productName, LEFT + 20 * MM, y, { size: 12, width: WIDTH - 75 * MM });
    putRight(doc, line.sku, RIGHT, y + 1 * MM, 9);
    y += 6 * MM;
    rule(doc, y, 0.6, ROW_GRAY);
    y += 3 * MM;
  }
  return y + 4 * MM;
}
