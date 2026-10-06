import { BOLD, type Doc, MM, put, REGULAR } from "../../../platform/pdf/paper-pdf-kit.js";
import { drawTag, fillBox, tagSize } from "../../../platform/pdf/paper-pdf-shapes.js";
import { CONTENT_WIDTH, CONTENT_X, MUTED, type Row, SOFT } from "./round-paper-pdf-layout.js";

/* Les corps, les teintes et les rangées génériques de la feuille de tournée. */

export const NAME_SIZE = 15;
export const WINDOW_SIZE = 13;
export const BODY_SIZE = 11.5;
export const SMALL_SIZE = 8.5;
export const BIN_SIZE = 14;
export const DISC_RADIUS = 5.5 * MM;
export const LINE_GAP = 1.2 * MM;
export const BOX_PAD = 2 * MM;
/** La teinte d'un arrêt : noir, ou gris quand il est annulé. */
export interface Tone {
  readonly ink: string;
  readonly muted: string;
}
export const LIVE: Tone = { ink: "#000000", muted: MUTED };
export const VOID: Tone = { ink: "#8a8a8a", muted: "#a5a5a5" };

/** Un texte qui passe à la ligne dans la colonne de contenu. */
export function textRow(
  doc: Doc,
  text: string,
  style: {
    readonly size: number;
    readonly bold?: boolean;
    readonly color: string;
    readonly indent?: number;
  },
): Row {
  const indent = style.indent ?? 0;
  const width = CONTENT_WIDTH - indent;
  const height = doc
    .font(style.bold === true ? BOLD : REGULAR)
    .fontSize(style.size)
    .heightOfString(text, { width });
  return {
    height: height + LINE_GAP,
    draw: (d, y) => {
      put(d, text, CONTENT_X + indent, y, {
        size: style.size,
        bold: style.bold === true,
        width,
        color: style.color,
      });
    },
  };
}

/** Des étiquettes encadrées en rangée, qui passent à la ligne. */
export function tagsRow(
  doc: Doc,
  tags: readonly string[],
  style: Parameters<typeof drawTag>[4],
): Row {
  const spacing = 2 * MM;
  const sizes = tags.map((tag) => tagSize(doc, tag, style));
  const lineHeight = (sizes[0]?.height ?? 0) + spacing;
  const positions: { x: number; line: number }[] = [];
  let x = 0;
  let line = 0;
  for (const size of sizes) {
    if (x > 0 && x + size.width > CONTENT_WIDTH) {
      x = 0;
      line += 1;
    }
    positions.push({ x, line });
    x += size.width + spacing;
  }
  return {
    height: (line + 1) * lineHeight + 0.5 * MM,
    draw: (d, y) => {
      tags.forEach((tag, index) => {
        const at = positions[index];
        if (at !== undefined) {
          drawTag(d, tag, CONTENT_X + at.x, y + at.line * lineHeight, style);
        }
      });
    },
  };
}

/** Un encadré léger : un libellé en petit, le texte dessous. */
export function noteRow(doc: Doc, label: string, text: string, tone: Tone): Row {
  const width = CONTENT_WIDTH - 2 * BOX_PAD;
  const textHeight = doc.font(REGULAR).fontSize(BODY_SIZE).heightOfString(text, { width });
  const height = BOX_PAD * 2 + SMALL_SIZE + 1 * MM + textHeight;
  return {
    height: height + 1.5 * MM,
    draw: (d, y) => {
      fillBox(d, { x: CONTENT_X, y, width: CONTENT_WIDTH, height }, SOFT);
      put(d, label.toUpperCase(), CONTENT_X + BOX_PAD, y + BOX_PAD, {
        size: SMALL_SIZE,
        bold: true,
        color: tone.muted,
      });
      put(d, text, CONTENT_X + BOX_PAD, y + BOX_PAD + SMALL_SIZE + 1 * MM, {
        size: BODY_SIZE,
        width,
        color: tone.ink,
      });
    },
  };
}

/** Des rangées posées d'un tenant, l'une sous l'autre. */
export function joinRows(rows: readonly Row[]): Row {
  return {
    height: rows.reduce((sum, row) => sum + row.height, 0),
    draw: (d, y) => {
      let at = y;
      for (const row of rows) {
        row.draw(d, at);
        at += row.height;
      }
    },
  };
}
