import { BLACK, type Doc } from "../../../../platform/pdf/paper-pdf-kit.js";

/**
 * **Les signes de la matrice, DESSINÉS** (plan §2) : les polices standard
 * (WinAnsi) n'ont ni ● ni ◐. Un disque plein dit « contient », un cercle à
 * moitié plein « peut contenir des traces ».
 */

export type MarkKind = "contains" | "traces";

/** Le trait du cercle de ◐ : assez épais pour se lire en photocopie. */
const OUTLINE = 0.7;

export function drawMark(doc: Doc, kind: MarkKind, x: number, y: number, radius: number): void {
  if (kind === "contains") {
    doc.save().circle(x, y, radius).fill(BLACK).restore();
  } else {
    doc
      .save()
      .path(
        `M ${String(x)} ${String(y - radius)} A ${String(radius)} ${String(radius)} 0 0 0 ${String(x)} ${String(y + radius)} Z`,
      )
      .fill(BLACK)
      .restore();
    doc
      .save()
      .lineWidth(OUTLINE)
      .strokeColor(BLACK)
      .circle(x, y, radius - OUTLINE / 2)
      .stroke()
      .restore();
  }
  doc.fillColor(BLACK);
}
