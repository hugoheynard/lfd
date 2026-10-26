import { BOLD, MM, put, RIGHT } from "../../../platform/pdf/paper-pdf-kit.js";
import { fillBox, strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";
import { gap, type Row } from "./round-paper-pdf-layout.js";
import { joinRows, LIVE } from "./round-paper-pdf-rows.js";

/** Le libellé de la case, tel que le livreur le lit — et que les tests cherchent. */
export const DROPPED_AT_LABEL = "Déposé à";

const BOX_WIDTH = 62 * MM;
const BOX_HEIGHT = 12 * MM;
const LABEL_SIZE = 11;
const H_SIZE = 16;
/** La longueur d'un blanc à remplir au stylo : deux chiffres manuscrits. */
const BLANK = 13 * MM;

/**
 * **La case « Déposé à __ h __ »** (décision de Hugo du 2026-10-26) : un
 * cadre au bord droit, en pied de chaque arrêt vivant, où le livreur note
 * l'heure de dépôt au stylo. C'est une rangée du bloc : sa hauteur compte
 * dans la décision de tourner la page, et la case ne se sépare jamais de
 * son arrêt (sauf pour un arrêt plus haut qu'une page, comme toute rangée).
 */
export function droppedAtRow(): Row {
  const box: Row = {
    height: BOX_HEIGHT,
    draw: (doc, y) => {
      const x = RIGHT - BOX_WIDTH;
      strokeBox(doc, { x, y, width: BOX_WIDTH, height: BOX_HEIGHT }, 1.2, LIVE.ink);
      const labelY = y + (BOX_HEIGHT - LABEL_SIZE) / 2;
      put(doc, DROPPED_AT_LABEL, x + 3 * MM, labelY, { size: LABEL_SIZE, bold: true });
      const labelWidth = doc.font(BOLD).fontSize(LABEL_SIZE).widthOfString(DROPPED_AT_LABEL);
      const baseline = y + BOX_HEIGHT - 3 * MM;
      const first = x + 3 * MM + labelWidth + 3 * MM;
      const hWidth = doc.font(BOLD).fontSize(H_SIZE).widthOfString("h");
      fillBox(doc, { x: first, y: baseline, width: BLANK, height: 0.8 }, LIVE.ink);
      put(doc, "h", first + BLANK + 1.5 * MM, baseline - H_SIZE * 0.8, {
        size: H_SIZE,
        bold: true,
      });
      const second = first + BLANK + 3 * MM + hWidth;
      fillBox(doc, { x: second, y: baseline, width: BLANK, height: 0.8 }, LIVE.ink);
    },
  };
  return joinRows([gap(2 * MM), box, gap(1 * MM)]);
}
